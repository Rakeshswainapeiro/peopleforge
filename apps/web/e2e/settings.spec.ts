import { expect, test, type Page } from '@playwright/test';
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

/** The active version, read from the criteria card's intro. */
async function activeVersion(page: Page): Promise<number> {
  const intro = page.getByText(/^Version (\d+), active since/u);
  return Number(/Version (\d+)/u.exec((await intro.textContent()) ?? '')?.[1]);
}

test('an admin adds a criterion with a threshold; the request page takes a measured value, then it is removed [R1-05]', async ({
  page,
}) => {
  await signIn(page, 'admin');
  await page.goto('/settings');
  let version = await activeVersion(page);
  await page.getByRole('button', { name: 'Add a criterion' }).click();
  const added = page.getByRole('group', { name: 'New criterion' });
  await added.getByLabel(/^Name \(English\) · New criterion/u).fill('Attendance');
  await added
    .getByLabel(/^Description \(English\) · New criterion/u)
    .fill('Attendance over the last 12 months.');
  await added.getByLabel(/^Passes on · New criterion/u).selectOption('gte');
  await added.getByLabel(/^Threshold · New criterion/u).fill('95');
  await added.getByLabel(/^Measured in · New criterion/u).selectOption('percent');
  await page.getByRole('button', { name: `Publish version ${String(version + 1)}` }).click();
  await expect(page.getByRole('status').filter({ hasText: 'published' })).toBeVisible();
  version += 1;
  await expect(page.getByRole('group', { name: 'C6' })).toBeVisible();

  // A new request pins this version: C6 asks for the attendance figure.
  await signIn(page, 'alphaHr');
  await page.goto('/requests/new');
  await page
    .getByRole('combobox', { name: 'Add employee' })
    .selectOption({ label: 'Mariam Saleh · EMP-1103 · G4' });
  await page.getByRole('button', { name: 'Add' }).click();
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}\/edit$/u);
  const c6 = page.getByRole('article', { name: /^C6 · Attendance/u });
  const value = c6.getByRole('textbox', { name: /Measured value/u });
  await expect(value).toHaveAccessibleDescription(/Passes at 95 or more \(percent\)/u);
  await value.fill('94.5');
  await expect(c6.getByText("Fail: doesn't meet the threshold.")).toBeVisible();
  await value.fill('96');
  await expect(c6.getByText('Pass: meets the threshold.')).toBeVisible();
  await page.getByRole('button', { name: 'Save draft' }).first().click();
  await expect(value).toHaveValue('96');
  await expect(c6.getByText('Pass: meets the threshold.')).toBeVisible();
  // Discard the draft so the other journeys start clean.
  await page.getByRole('button', { name: 'Remove Mariam Saleh' }).click();
  await page.waitForURL('/?discarded=1');

  // Removing C6 publishes the next version; its code is never reused.
  await signIn(page, 'admin');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Remove C6' }).click();
  await expect(page.getByRole('group', { name: 'C6' })).toHaveCount(0);
  await page.getByRole('button', { name: `Publish version ${String(version + 1)}` }).click();
  await expect(page.getByRole('status').filter({ hasText: 'published' })).toBeVisible();
  await expect(page.getByRole('group', { name: /^C\d$/u })).toHaveCount(5);
});

test('Sirius HR reviewers and subsidiary HR have no settings', async ({ page }) => {
  await signIn(page, 'reviewer');
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }),
  ).toHaveCount(0);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
