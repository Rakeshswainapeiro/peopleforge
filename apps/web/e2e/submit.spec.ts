import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/sign-in';

// Critical journey (R1-07): subsidiary HR completes a draft and submits it to Sirius HR after a
// confirmation; the request becomes read-only with its progress; the submitter and Sirius HR
// reviewers are notified; another subsidiary still can't see it (R1-01, NFR-SEC-01).
test.describe.configure({ mode: 'serial' });

let requestUrl = '';
let reference = '';

const PDF = Buffer.from(
  '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
  'latin1',
);

function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

const criterion = (page: Page, code: string) =>
  page.getByRole('article').filter({ has: page.getByRole('heading', { name: `${code} ·` }) });

test('subsidiary HR completes a draft and submits it to Sirius HR', async ({ page }) => {
  const errors = watchForErrors(page);
  await signIn(page, 'alphaHr');
  await page.goto('/requests/new');
  await page
    .getByRole('combobox', { name: 'Add employee' })
    .selectOption({ label: 'Mariam Saleh · EMP-1103 · G4' });
  await page.getByRole('button', { name: 'Add' }).click();
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/u);
  requestUrl = page.url();
  const eyebrow = await page.getByText(/^Subsidiary HR · INC-\d{4}-\d{4} · Draft$/u).textContent();
  reference = /INC-\d{4}-\d{4}/u.exec(eyebrow ?? '')?.[0] ?? '';
  expect(reference).not.toBe('');

  const submit = page.getByRole('button', { name: 'Submit to Sirius HR' });
  await expect(submit).toBeDisabled();

  for (const code of ['C1', 'C2', 'C3', 'C4']) {
    await page
      .getByLabel(`Attach a file for ${code}`)
      .setInputFiles({ name: `${code}.pdf`, mimeType: 'application/pdf', buffer: PDF });
    await expect(page.getByRole('link', { name: `Download ${code}.pdf` })).toBeVisible();
  }
  for (const code of ['C1', 'C2', 'C3', 'C4', 'C5']) {
    await criterion(page, code).getByText('Pass', { exact: true }).click();
    await criterion(page, code).getByRole('textbox').fill(`Meets ${code}.`);
  }
  await page.getByRole('textbox', { name: 'Proposed increase for Mariam Saleh' }).fill('5');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await expect(submit).toBeEnabled();

  // A confirmation first; Cancel changes nothing.
  await submit.click();
  const dialog = page.getByRole('dialog', { name: `Submit ${reference} to Sirius HR?` });
  await expect(dialog).toContainText('1 employee goes to Sirius HR for review.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  await submit.click();
  await dialog.getByRole('button', { name: 'Submit to Sirius HR' }).click();
  await page.waitForURL(`${requestUrl}?submitted=1`);
  await expect(
    page.getByText('Request submitted to Sirius HR. Both sides have been notified.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: `Increment request ${reference}` }),
  ).toBeVisible();
  await expect(page.getByText('Waiting for Sirius HR')).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Progress' }).locator('[aria-current="step"]'),
  ).toContainText('Review in progress');
  // Read-only: no editing controls, no criteria editor.
  await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '2. Eligibility criteria' })).toHaveCount(0);
  // No longer under "Needs your action" on Home.
  await page.goto('/');
  const id = requestUrl.split('/').at(-1) ?? '';
  await expect(page.locator(`a[href="/requests/${id}"]`)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the submitter is notified', async ({ page }) => {
  await signIn(page, 'alphaHr');
  await page.goto('/notifications');
  const row = page.getByRole('listitem').filter({ hasText: reference });
  await expect(row).toContainText('Submitted to Sirius HR with 1 employee.');
  await expect(row).toHaveAttribute('data-unread', 'true');
});

test('Sirius HR reviewers are notified and can open the submitted request', async ({ page }) => {
  const errors = watchForErrors(page);
  await signIn(page, 'reviewer');
  const bell = page.getByRole('navigation', { name: 'Main' }).getByRole('link', {
    name: /^Notifications ?, \d+ unread$/u,
  });
  await expect(bell).toBeVisible();
  await bell.click();
  const row = page.getByRole('listitem').filter({ hasText: reference });
  await expect(row).toContainText('Action needed');
  await expect(row).toContainText(/New request from SUB-A with 1 employee, submitted by .+\./u);

  // It is unread until read; Mark all as Read clears it (and anything older).
  const filters = page.getByRole('navigation', { name: 'Filter notifications' });
  await filters.getByRole('link', { name: /^Unread/u }).click();
  await expect(page.getByRole('listitem').filter({ hasText: reference })).toBeVisible();
  await page.getByRole('button', { name: 'Mark all as Read' }).click();
  await expect(page.getByText('No notifications')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark all as Read' })).toBeDisabled();
  await expect(
    page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Notifications', exact: true }),
  ).toBeVisible();

  await filters.getByRole('link', { name: /^Action needed/u }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: reference })
    .getByRole('button', { name: 'View' })
    .click();
  await page.waitForURL(requestUrl);
  await expect(
    page.getByRole('heading', { level: 1, name: `Increment request ${reference}` }),
  ).toBeVisible();
  await expect(page.getByRole('row', { name: /Mariam Saleh/u })).toContainText('5/5 complete');
  expect(errors).toEqual([]);
});

test('another subsidiary still can’t open it', async ({ page }) => {
  await signIn(page, 'betaHr');
  await page.goto(requestUrl);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.goto('/notifications');
  await expect(page.getByRole('listitem').filter({ hasText: reference })).toHaveCount(0);
});
