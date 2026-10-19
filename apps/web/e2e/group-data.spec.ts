import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/sign-in';

// Group employee data end to end (R2-01 … R2-04, R2-08 … R2-12): a subsidiary uploads a file
// with errors (rejected, nothing changes), then two valid months; the jump in pay raises an
// anomaly flag, which its owner resolves with a note; Sirius HR extracts the raw data; another
// subsidiary sees none of it.
test.describe.configure({ mode: 'serial' });

const HEADERS = [
  'Employee ID',
  'Full name',
  'Department',
  'Designation',
  'Grade',
  'Gross monthly salary',
  'Basic monthly salary',
  'Currency',
  'Date of joining',
  'Date of birth',
  'Gender',
  'Nationality',
  'Employment status',
  'Leaving date',
  'Cost centre',
];

/** "2026-09" for `months` before the current month (UTC is close enough for the choice). */
function monthBefore(months: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1))
    .toISOString()
    .slice(0, 7);
}

// A token per run: the same file twice would be refused as the version already in use.
const RUN = Date.now().toString(36);

/** Subsidiary A's seeded employees (the employee master keeps them active), Aisha's pay given. */
function csv(aishaPay: string, rows: string[][] = []): Buffer {
  const people = [
    [
      'EMP-1101',
      'Aisha Rahman',
      'Finance',
      'Analyst',
      'G5',
      aishaPay,
      '',
      'AED',
      '2020-01-15',
      '1990-05-01',
      'female',
      'AE',
      'active',
      '',
      `CC-${RUN}`,
    ],
    [
      'EMP-1102',
      'Yusuf Karim',
      'Finance',
      'Lead',
      'G6',
      '16800.00',
      '',
      'AED',
      '2019-03-01',
      '1988-02-11',
      'male',
      'AE',
      'active',
      '',
      `CC-${RUN}`,
    ],
    [
      'EMP-1103',
      'Mariam Saleh',
      'Operations',
      'Officer',
      'G4',
      '11500.00',
      '',
      'AED',
      '2021-06-20',
      '1994-09-30',
      'female',
      'AE',
      'active',
      '',
      `CC-${RUN}`,
    ],
    ...rows,
  ];
  return Buffer.from([HEADERS, ...people].map((row) => row.join(',')).join('\n'), 'utf8');
}

async function upload(page: Page, period: string, body: Buffer, name: string): Promise<void> {
  await page.goto('/group/upload');
  const form = page.getByRole('form', { name: 'Upload a month' });
  await form.getByLabel('Month').selectOption(period);
  await form.getByLabel(/^File/u).setInputFiles({ name, mimeType: 'text/csv', buffer: body });
  await form.getByRole('button', { name: 'Upload' }).click();
  await page.waitForURL(/\/group\/uploads\/[0-9a-f-]{36}$/u);
}

test('a file with errors is rejected with every problem, and changes nothing', async ({ page }) => {
  await signIn(page, 'alphaHr');
  const bad = csv('14200.00', [
    [
      '',
      'No ID',
      'Finance',
      'Analyst',
      'G5',
      'abc',
      '',
      'AED',
      '2020-01-15',
      '1990-05-01',
      'female',
      'AE',
      'active',
      '',
      '',
    ],
  ]);
  await upload(page, monthBefore(1), bad, 'bad.csv');
  await expect(page.getByText('Rejected: nothing changed')).toBeVisible();
  const problems = page.getByRole('table', { name: 'Problems found' });
  await expect(problems).toContainText('Row 5');
  await expect(problems).toContainText('A value is required.');
  await expect(problems).toContainText('Not a number.');
  // Values are never shown.
  await expect(problems).not.toContainText('abc');
  await expect(page.getByRole('link', { name: 'Upload a corrected file' })).toBeVisible();
});

test('two valid months are accepted as versions, and the jump in pay raises a flag', async ({
  page,
}) => {
  await signIn(page, 'alphaHr');
  await upload(page, monthBefore(2), csv('10000.00'), 'earlier.csv');
  await expect(page.getByText(/^Accepted as version \d+$/u)).toBeVisible();

  await upload(page, monthBefore(1), csv('14200.00'), 'latest.csv');
  await expect(page.getByText(/^Accepted as version \d+$/u)).toBeVisible();
  await expect(page.getByTestId('compare-headcount')).toContainText('3 → 3');
  await page.getByRole('link', { name: /^View \d+ flags?$/u }).click();

  await page.getByLabel('Rule').selectOption('ANM-03');
  await page.getByLabel('Status').selectOption('open');
  const flags = page.getByRole('table', { name: 'Flags' });
  await expect(flags.getByRole('row').nth(1)).toContainText('Aisha Rahman · EMP-1101');
  await flags.getByRole('row').nth(1).getByRole('link').click();
  await expect(page.getByTestId('detail-previous')).toContainText('10,000');
  await expect(page.getByTestId('detail-current')).toContainText('14,200');

  // Resolving needs a note.
  const resolution = page.getByRole('form', { name: 'Resolution' });
  await resolution.getByLabel('Status').selectOption('resolved');
  await resolution.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('region', { name: 'Resolution' }).getByRole('alert')).toContainText(
    'Write a resolution note',
  );
  await resolution.getByLabel('Status').selectOption('resolved');
  await resolution.getByLabel('Resolution note').fill('Promotion to G5 effective this month.');
  await resolution.getByRole('button', { name: 'Save' }).click();
  await expect(resolution.getByRole('status')).toHaveText('Saved.');
  await expect(page.getByText(/^Status Resolved · owner Alpha HR Test$/u)).toBeVisible();
});

test('the employee data shows the version in use, with its history', async ({ page }) => {
  await signIn(page, 'alphaHr');
  await page.goto(`/group/employees?period=${monthBefore(1)}&q=EMP-1101`);
  const table = page.getByRole('table', { name: 'Employee data' });
  await expect(table).toContainText('AED 14,200');
  await table.getByRole('link', { name: 'Aisha Rahman' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Aisha Rahman' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Versions' })).toContainText('14200.00');
});

test('another subsidiary sees none of it', async ({ page }) => {
  await signIn(page, 'betaHr');
  await page.goto(`/group/employees?period=${monthBefore(1)}&q=EMP-1101`);
  await expect(page.getByText('No records for this month')).toBeVisible();
  await page.goto('/group/uploads');
  await expect(page.getByRole('main')).not.toContainText('SUB-A');
  await page.goto('/group/extract');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('Sirius HR extracts the raw data as CSV', async ({ page }) => {
  await signIn(page, 'reviewer');
  await page.goto('/group/extract');
  const form = page.getByRole('form', { name: 'Extract' });
  await form.getByLabel('Month').selectOption(monthBefore(1));
  await form.getByLabel('Format').selectOption('csv');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    form.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`PeopleForge-RP-08-${monthBefore(1)}.csv`);
  // The path is Playwright's own temporary download file.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const body = await readFile(await download.path(), 'utf8');
  expect(body.startsWith('﻿Subsidiary,Month,Upload')).toBe(true);
  expect(body).toContain('Aisha Rahman');
});
