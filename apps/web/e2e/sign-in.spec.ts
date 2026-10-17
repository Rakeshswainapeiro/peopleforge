import { expect, test } from '@playwright/test';
import { actAs, signIn } from './support/sign-in';

// Critical journey (ADR-003): organisation sign-in through the identity provider, the API
// accepting the user's token, sign-out ending both sessions, and refusal without a role.
test.describe('organisation sign-in', () => {
  test('sends visitors to the sign-in screen', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('/sign-in');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Sign in with your organisation account' }),
    ).toBeVisible();
  });

  test('signs in, shows the API-confirmed identity, and signs out', async ({ page }) => {
    await signIn(page, 'reviewer');
    await expect(page.getByTestId('viewer-name')).toContainText('Reviewer Test');
    await expect(page.getByRole('heading', { level: 1, name: 'Request Tracker' })).toBeVisible();

    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name === 'peopleforge.session_token');
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Lax');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('/sign-in');
    await page.goto('/');
    await page.waitForURL('/sign-in');
  });

  test('refuses a person without a PeopleForge role', async ({ page }) => {
    await actAs(page, 'noRole');
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Sign in with your organisation account' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign-in failed' })).toBeVisible();
    // (Next.js adds its own empty route-announcer alert, so pick ours by content.)
    await expect(page.getByRole('alert').filter({ hasText: 'Sign-in failed' })).toContainText(
      "doesn't have access to PeopleForge",
    );
    // The error code is cleared from the address bar, so a refresh starts clean.
    await expect(page).toHaveURL('/sign-in');

    await page.getByRole('button', { name: 'Back to sign in' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });
});
