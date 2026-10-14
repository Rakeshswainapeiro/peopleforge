import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/sign-in';

// Critical journey (R1-02): a subsidiary creates a draft, adds employees, proposes increments
// as % and as an amount, sees totals, fixes a refused value, removes an employee, and another
// subsidiary — and Sirius HR, for a draft — cannot open it (R1-01, NFR-SEC-01).
test.describe.configure({ mode: 'serial' });

let requestUrl = '';

async function addEmployee(page: Page, option: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Add employee' }).selectOption({ label: option });
  await page.getByRole('button', { name: 'Add' }).click();
}

test('subsidiary HR raises a draft and proposes increments', async ({ page }) => {
  await signIn(page, 'alphaHr');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'New Request' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'New increment request' }),
  ).toBeVisible();
  // Only Subsidiary A's employees are offered.
  await expect(page.getByRole('option', { name: /Rohan Das/u })).toHaveCount(0);

  await addEmployee(page, 'Aisha Rahman · EMP-1101 · G5');
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/u);
  requestUrl = page.url();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    /Increment request INC-2026-\d{4}/u,
  );
  await addEmployee(page, 'Yusuf Karim · EMP-1102 · G6');

  const table = page.getByRole('table', {
    name: 'Employees in this request and their proposed increments',
  });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('row', { name: /Aisha Rahman/u })).toContainText(/AED\s14,200/u);

  await page.getByRole('textbox', { name: 'Proposed increase for Aisha Rahman' }).fill('8');
  await page
    .getByRole('group', { name: 'Proposed as, for Yusuf Karim' })
    .getByText('AED', { exact: true })
    .click();
  await page.getByRole('textbox', { name: 'Proposed increase for Yusuf Karim' }).fill('1,680');
  await page.getByRole('button', { name: 'Save draft' }).click();

  await expect(page.getByText('Draft saved.')).toBeVisible();
  // 8% of 14,200 = 1,136; 1,680 of 16,800 = 10%; total 2,816; average 9%.
  await expect(table.getByRole('row', { name: /Aisha Rahman/u })).toContainText(/AED\s15,336/u);
  await expect(page.getByTestId('total-increase')).toHaveText(/^AED\s2,816 \/ month$/u);
  await expect(page.getByTestId('average-percent')).toHaveText('9%');
});

test('a refused value is explained on its row and kept', async ({ page }) => {
  await signIn(page, 'alphaHr');
  await page.goto(requestUrl);
  const value = page.getByRole('textbox', { name: 'Proposed increase for Aisha Rahman' });
  await value.fill('150');
  await value.press('Enter');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Some proposals need a fix' }),
  ).toBeVisible();
  await expect(value).toHaveValue('150');
  await expect(value).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(/at most 100%/u)).toBeVisible();
});

test('removing an employee, and continuing the draft from Home', async ({ page }) => {
  await signIn(page, 'alphaHr');
  await page.goto(requestUrl);
  await page.getByRole('button', { name: 'Remove Yusuf Karim' }).click();
  await expect(page.getByRole('row', { name: /Yusuf Karim/u })).toHaveCount(0);

  await page.goto('/');
  const reference = requestUrl.split('/').at(-1) ?? '';
  const drafts = page.getByRole('region', { name: 'Needs your action' });
  await expect(drafts).toBeVisible();
  await drafts.locator(`a[href="/requests/${reference}"]`).click();
  await page.waitForURL(requestUrl);
});

for (const user of ['betaHr', 'reviewer'] as const) {
  test(`${user} cannot open Subsidiary A's draft`, async ({ page }) => {
    await signIn(page, user);
    await page.goto(requestUrl);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByText('Aisha Rahman')).toHaveCount(0);
  });
}
