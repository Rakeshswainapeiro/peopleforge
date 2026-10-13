import type { Page } from '@playwright/test';
import { TEST_USER_COOKIE } from '@sirius/identity/testing';
import type { TestUser } from './users';

/** Chooses who the test provider signs in for this browser context. */
export async function actAs(page: Page, user: TestUser): Promise<void> {
  await page
    .context()
    .addCookies([{ name: TEST_USER_COOKIE, value: user, domain: '127.0.0.1', path: '/' }]);
}

/** The full organisation sign-in journey, ending on the home page. */
export async function signIn(page: Page, user: TestUser): Promise<void> {
  await actAs(page, user);
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Sign in with your organisation account' }).click();
  await page.waitForURL('/');
}
