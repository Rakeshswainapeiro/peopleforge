import { expect, test } from '@playwright/test';
import { signIn } from './support/sign-in';

// App shell and entity scoping end to end (R1-01, R2-12): the API reads the user's
// subsidiaries from the database under Row-Level Security; the sidebar shows what the
// role may use, and pages re-check permissions on the server.
test.describe('portal shell', () => {
  test('shows Sirius HR every subsidiary, without New Request', async ({ page }) => {
    await signIn(page, 'reviewer');
    const nav = page.getByRole('navigation', { name: 'Main' });
    // The bell may carry an unread count, depending on what other tests did.
    await expect(nav.getByRole('link')).toHaveText([
      'Request Tracker',
      'Review Queue',
      'Conversations',
      /^Notifications/u,
      'Audit trail',
      'Analytics',
      'Employee data',
      'Uploads',
      'Data quality',
      'Raw data extract',
      'Reports',
    ]);
    await expect(nav.getByRole('link', { name: 'Request Tracker' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('Sirius HR Reviewer · All subsidiaries')).toBeVisible();

    await page.goto('/requests/new');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('scopes subsidiary HR to its own subsidiary and opens New Request', async ({ page }) => {
    await signIn(page, 'alphaHr');
    await expect(page.getByText('Subsidiary HR · Subsidiary A')).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link')).toHaveText([
      'My Request',
      'New Request',
      'Conversations',
      /^Notifications/u,
      'Employee data',
      'Upload data',
      'Uploads',
      'Data quality',
      'Reports',
    ]);

    await nav.getByRole('link', { name: 'New Request' }).click();
    await page.waitForURL('/requests/new');
    await expect(
      page.getByRole('heading', { level: 1, name: 'New increment request' }),
    ).toBeVisible();
    await expect(nav.getByRole('link', { name: 'New Request' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
