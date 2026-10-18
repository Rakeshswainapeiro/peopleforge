import { expect, test } from '@playwright/test';
import { signIn } from './support/sign-in';

// Settings (R1-05, R1-13, NFR-CFG-01): an admin changes a reminder trigger and publishes the
// criteria as a new version; nobody else has the page.
test.describe.configure({ mode: 'serial' });

test('an admin changes a reminder trigger', async ({ page }) => {
  await signIn(page, 'admin');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  const review = page.getByRole('form', { name: "Waiting for Sirius HR's review" });
  await review.getByRole('spinbutton', { name: 'Days' }).fill('3');
  await review.getByRole('button', { name: 'Save' }).click();
  await expect(review.getByRole('status')).toHaveText('Saved.');
  await page.reload();
  await expect(review.getByRole('spinbutton', { name: 'Days' })).toHaveValue('3');
  await expect(review).toContainText('Changed by Admin Test');
  // Back to the default for the other tests.
  await review.getByRole('spinbutton', { name: 'Days' }).fill('2');
  await review.getByRole('button', { name: 'Save' }).click();
  await expect(review.getByRole('status')).toHaveText('Saved.');
});

test('an admin publishes the criteria as a new version', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/settings');
  const intro = page.getByText(/^Version (\d+), active since/u);
  const version = Number(/Version (\d+)/u.exec((await intro.textContent()) ?? '')?.[1]);
  const c5 = page.getByRole('group', { name: 'C5' });
  const description = c5.getByLabel(/^Description \(English\) · C5/u);
  const original = await description.inputValue();
  await description.fill(`${original} (Reviewed ${String(version + 1)}.)`);
  await page.getByRole('button', { name: `Publish version ${String(version + 1)}` }).click();
  await expect(page.getByRole('status').filter({ hasText: 'published' })).toHaveText(
    `Version ${String(version + 1)} published.`,
  );
  await expect(page.getByText(/^Version \d+, active since/u)).toContainText(
    `Version ${String(version + 1)},`,
  );
  // A blank name is refused, and what was typed stays.
  const name = page.getByRole('group', { name: 'C1' }).getByLabel(/^Name \(English\) · C1/u);
  await name.fill(' ');
  await page.getByRole('button', { name: `Publish version ${String(version + 2)}` }).click();
  await expect(
    page.getByRole('region', { name: 'Eligibility criteria' }).getByRole('alert'),
  ).toContainText('names and descriptions are required');
  // Restore the description (another version) for the other tests.
  await page.reload();
  await page
    .getByRole('group', { name: 'C5' })
    .getByLabel(/^Description \(English\) · C5/u)
    .fill(original);
  await page.getByRole('button', { name: `Publish version ${String(version + 2)}` }).click();
  await expect(page.getByRole('status').filter({ hasText: 'published' })).toBeVisible();
});

test('Sirius HR reviewers and subsidiary HR have no settings', async ({ page }) => {
  await signIn(page, 'reviewer');
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }),
  ).toHaveCount(0);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
