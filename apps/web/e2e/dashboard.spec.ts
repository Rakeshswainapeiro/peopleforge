import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/sign-in';

// Critical journey (R1-10, DASH-D1): subsidiary HR finds a draft on "My increment requests",
// filters to it, opens its employees and one employee's status; other subsidiaries and Sirius HR
// never see it (R1-01, NFR-SEC-01).
test.describe.configure({ mode: 'serial' });

let reference = '';
let statusUrl = '';

function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function search(page: Page, text: string): Promise<void> {
  await page.getByRole('searchbox', { name: 'Search' }).fill(text);
  await page.waitForURL((url) => url.searchParams.get('q') === text);
}

test('subsidiary HR finds a draft, its employees and one employee’s status', async ({ page }) => {
  const errors = watchForErrors(page);
  await signIn(page, 'alphaHr');
  await page.goto('/requests/new');
  await page
    .getByRole('combobox', { name: 'Add employee' })
    .selectOption({ label: 'Aisha Rahman · EMP-1101 · G5' });
  await page.getByRole('button', { name: 'Add' }).click();
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/u);
  const eyebrow = await page.getByText(/^Subsidiary HR · INC-\d{4}-\d{4} · Draft$/u).textContent();
  reference = /INC-\d{4}-\d{4}/u.exec(eyebrow ?? '')?.[0] ?? '';
  expect(reference).not.toBe('');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'My increment requests' }),
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Request counts' }).getByRole('listitem'),
  ).toHaveCount(5);
  const action = page.getByRole('region', { name: 'Needs your action' });
  await expect(action).toContainText(`${reference} · Draft not submitted`);
  await expect(action).toContainText('1 employee added · criteria 0 of 5 complete');

  // Search narrows the list to the draft, in place (no full reload).
  await search(page, reference);
  const table = page.getByRole('table', { name: 'Increment requests' });
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table).toContainText('Not submitted');
  await expect(table).toContainText('Draft');

  // Its employees, then one employee's status.
  await table.getByRole('link', { name: `View the employees of ${reference}` }).click();
  await page.waitForURL(/view=employees/u);
  await expect(page.getByText(`Employees of ${reference}`)).toBeVisible();
  const employees = page.getByRole('table', { name: 'Employees in increment requests' });
  await expect(employees).toContainText('Aisha Rahman');
  await expect(employees).toContainText('Not proposed');
  await employees.getByRole('link', { name: 'View the status of Aisha Rahman' }).click();
  await page.waitForURL(/\/employees\/[0-9a-f-]{36}$/u);
  statusUrl = page.url();
  await expect(page.getByRole('heading', { level: 1, name: 'Aisha Rahman' })).toBeVisible();
  await expect(page.getByText('Not submitted yet')).toBeVisible();
  await expect(page.getByText('0 of 5')).toBeVisible();
  await page.getByRole('link', { name: 'Back to my requests' }).click();
  await page.waitForURL('/');
  expect(errors).toEqual([]);
});

test('another subsidiary finds nothing of it, not even by its reference or link', async ({
  page,
}) => {
  await signIn(page, 'betaHr');
  await search(page, reference);
  await expect(page.getByText('Nothing matches these filters')).toBeVisible();
  await page.goto(statusUrl);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('Sirius HR sees every subsidiary’s submitted requests, never a draft', async ({ page }) => {
  await signIn(page, 'reviewer');
  await expect(page.getByRole('heading', { level: 1, name: 'Increment requests' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Needs your action' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'New increment request' })).toHaveCount(0);
  await search(page, reference);
  await expect(page.getByText('Nothing matches these filters')).toBeVisible();
});
