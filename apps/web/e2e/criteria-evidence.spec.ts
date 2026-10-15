import { EICAR } from '@peopleforge/integrations/testing';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/sign-in';

// Critical journey (R1-03, R1-04, R1-06): subsidiary HR assesses each employee against the
// criteria — Pass/Fail, a justification, evidence files (scanned; an infected or disguised
// file is refused) — sees completeness in the table and the "Ready to submit?" panel, and
// another subsidiary cannot download the files (R1-01, NFR-SEC-01).
test.describe.configure({ mode: 'serial' });

let requestUrl = '';
let downloadPath = '';

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

/** A criterion card, by its code ("C1" … "C5"): its accessible name starts "C1 · …". */
const criterion = (page: Page, code: string) =>
  page.getByRole('article').filter({ has: page.getByRole('heading', { name: `${code} ·` }) });

async function assess(page: Page, code: string, result: 'Pass' | 'Fail', text: string) {
  const card = criterion(page, code);
  await card.getByText(result, { exact: true }).click();
  await card.getByRole('textbox', { name: /^Justification/u }).fill(text);
}

async function attach(page: Page, code: string, name: string, body: Buffer, mimeType: string) {
  await page
    .getByLabel(`Attach a file for ${code}`)
    .setInputFiles({ name, mimeType, buffer: body });
}

test('subsidiary HR assesses an employee against the criteria with evidence', async ({ page }) => {
  const errors = watchForErrors(page);
  await signIn(page, 'alphaHr');
  await page.goto('/requests/new');
  await page
    .getByRole('combobox', { name: 'Add employee' })
    .selectOption({ label: 'Aisha Rahman · EMP-1101 · G5' });
  await page.getByRole('button', { name: 'Add' }).click();
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}\/edit$/u);
  requestUrl = page.url();
  await page
    .getByRole('combobox', { name: 'Add employee' })
    .selectOption({ label: 'Yusuf Karim · EMP-1102 · G6' });
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('row', { name: /Yusuf Karim/u })).toHaveCount(1);

  // The first employee is assessed by default.
  const assessing = (name: string) =>
    page.getByRole('heading', { level: 2, name: `2. Eligibility criteria for ${name}` });
  await expect(assessing('Aisha Rahman')).toBeVisible();
  await expect(criterion(page, 'C1')).toHaveAttribute('data-complete', 'false');

  // A clean PDF is accepted, scanned and listed straight away.
  await attach(page, 'C1', 'appraisal 2026.pdf', PDF, 'application/pdf');
  await expect(page.getByRole('link', { name: 'Download appraisal 2026.pdf' })).toBeVisible();

  // A PDF carrying the EICAR test string is refused by the malware scan (the type check comes
  // first, so the plain EICAR text file would be refused as a type instead), and a disguised
  // file by its content.
  const infected = Buffer.concat([PDF, Buffer.from(EICAR)]);
  await attach(page, 'C2', 'payslip.pdf', infected, 'application/pdf');
  await expect(criterion(page, 'C2').getByRole('alert')).toContainText(
    'The malware scan rejected that file.',
  );
  await attach(page, 'C2', 'notes.pdf', Buffer.from('<html>not a pdf</html>'), 'application/pdf');
  await expect(criterion(page, 'C2').getByRole('alert')).toContainText(
    'That file type isn’t accepted here.',
  );
  await expect(criterion(page, 'C2').getByRole('link')).toHaveCount(0);

  // Typed text survives an upload: the page refreshes, the draft's version doesn't change.
  await assess(page, 'C1', 'Pass', 'Rated 4 of 5 in the 2026 appraisal.');
  await attach(page, 'C3', 'record.pdf', PDF, 'application/pdf');
  const record = page.getByRole('link', { name: 'Download record.pdf' });
  await expect(record).toBeVisible();
  // Kept (not removed later) for the cross-subsidiary checks.
  downloadPath = (await record.getAttribute('href')) ?? '';
  await expect(criterion(page, 'C1').getByRole('textbox')).toHaveValue(
    'Rated 4 of 5 in the 2026 appraisal.',
  );

  await attach(page, 'C2', 'contract.pdf', PDF, 'application/pdf');
  await expect(page.getByRole('link', { name: 'Download contract.pdf' })).toBeVisible();
  await attach(page, 'C4', 'salary-band.pdf', PDF, 'application/pdf');
  await expect(page.getByRole('link', { name: 'Download salary-band.pdf' })).toBeVisible();
  await assess(page, 'C2', 'Fail', 'Joined in March 2026: under the minimum service.');
  await assess(page, 'C3', 'Pass', 'No disciplinary action on file.');
  await assess(page, 'C4', 'Pass', 'Below the grade midpoint.');
  // C5 takes files but doesn't need them.
  await assess(page, 'C5', 'Pass', 'All mandatory training completed.');
  await page.getByRole('textbox', { name: 'Proposed increase for Aisha Rahman' }).fill('6');
  await page.getByRole('button', { name: 'Save draft' }).click();

  await expect(page.getByText('Draft saved.')).toBeVisible();
  await expect(assessing('Aisha Rahman')).toBeVisible();
  await expect(page.getByRole('row', { name: /Aisha Rahman/u })).toContainText('5/5 complete');
  await expect(criterion(page, 'C1')).toHaveAttribute('data-complete', 'true');
  await expect(criterion(page, 'C2').getByRole('radio', { name: 'Fail' })).toBeChecked();
  await expect(page.getByText('All 5 criteria complete')).toBeVisible();
  await expect(page.getByTestId('ready-note')).toHaveText(
    '1 of 2 employees still have incomplete criteria. Submit unlocks when every employee is 5/5.',
  );
  await expect(page.getByRole('button', { name: 'Submit to Sirius HR' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('the pencil saves and opens the next employee’s criteria', async ({ page }) => {
  const errors = watchForErrors(page);
  await signIn(page, 'alphaHr');
  await page.goto(requestUrl);
  await page.getByRole('textbox', { name: 'Proposed increase for Yusuf Karim' }).fill('5');
  await page.getByRole('button', { name: 'Assess criteria for Yusuf Karim' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: '2. Eligibility criteria for Yusuf Karim' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/employee=[0-9a-f-]{36}#criteria$/u);
  // The proposal typed before switching was saved.
  await expect(
    page.getByRole('textbox', { name: 'Proposed increase for Yusuf Karim' }),
  ).toHaveValue('5');
  await expect(criterion(page, 'C1').getByRole('link')).toHaveCount(0);
  await expect(page.getByText('5 criteria incomplete', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the evidence downloads as an attachment, and can be removed', async ({ page }) => {
  await signIn(page, 'alphaHr');
  // The owner can download the file the other subsidiary is refused below.
  const own = await page.request.get(downloadPath);
  expect(own.status()).toBe(200);
  expect(own.headers()['content-type']).toBe('application/pdf');
  await page.goto(requestUrl);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download appraisal 2026.pdf' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('appraisal 2026.pdf');
  await page.getByRole('button', { name: 'Remove appraisal 2026.pdf' }).click();
  await expect(page.getByRole('link', { name: 'Download appraisal 2026.pdf' })).toHaveCount(0);
  // C1 needs evidence again: no longer complete.
  await expect(page.getByRole('row', { name: /Aisha Rahman/u })).toContainText('4/5 complete');
});

for (const user of ['betaHr', 'reviewer'] as const) {
  test(`${user} cannot download Subsidiary A's evidence`, async ({ page }) => {
    await signIn(page, user);
    expect(downloadPath).toMatch(/^\/requests\/[0-9a-f-]{36}\/evidence\/[0-9a-f-]{36}$/u);
    const response = await page.request.get(downloadPath);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('%PDF');
  });
}
