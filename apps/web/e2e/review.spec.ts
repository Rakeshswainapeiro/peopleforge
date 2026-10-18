import { expect, test, type Page } from '@playwright/test';
import { waitForEmail } from './support/mail';
import { signIn } from './support/sign-in';

// Critical journey (R1-07 … R1-10): Sirius HR verifies each criterion and decides each
// employee; a returned employee goes back to the subsidiary with a question, is fixed and
// resubmitted, checked again and approved at another increment. Both sides are notified;
// another subsidiary sees none of it (R1-01, NFR-SEC-01).
test.describe.configure({ mode: 'serial' });

let detailUrl = '';
let reference = '';

const PDF = Buffer.from(
  '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
  'latin1',
);
const CODES = ['C1', 'C2', 'C3', 'C4', 'C5'];

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

/** Completes every criterion of the employee whose criteria are open, then saves. */
async function completeCriteria(page: Page) {
  for (const code of CODES.slice(0, 4)) {
    await page
      .getByLabel(`Attach a file for ${code}`)
      .setInputFiles({ name: `${code}.pdf`, mimeType: 'application/pdf', buffer: PDF });
    await expect(
      criterion(page, code).getByRole('link', { name: `Download ${code}.pdf` }),
    ).toBeVisible();
  }
  for (const code of CODES) {
    await criterion(page, code).getByText('Pass', { exact: true }).click();
    await criterion(page, code).getByRole('textbox').fill(`Meets ${code}.`);
  }
}

/** Opens one employee of the request from the review queue. */
async function openInQueue(page: Page, name: string) {
  await page.goto(`/review?filter=all&q=${reference}`);
  const queue = page.getByRole('table', { name: 'Employees in the review queue' });
  await queue
    .getByRole('link', { name: `Review ${name}`, exact: true })
    .or(queue.getByRole('link', { name: `View ${name}`, exact: true }))
    .click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** Ticks every criterion for the employee on screen; each tick reloads the page. */
async function verifyAll(page: Page, name: string) {
  for (const code of CODES) {
    await page.getByRole('button', { name: `Mark ${code} verified for ${name}` }).click();
    await expect(
      page.getByRole('button', { name: `Undo the check of ${code} for ${name}` }),
    ).toBeVisible();
  }
}

test('subsidiary HR submits two employees', async ({ page }) => {
  const errors = watchForErrors(page);
  await signIn(page, 'alphaHr');
  await page.goto('/requests/new');
  await page
    .getByRole('combobox', { name: 'Add employee' })
    .selectOption({ label: 'Aisha Rahman · EMP-1101 · G5' });
  await page.getByRole('button', { name: 'Add' }).click();
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}\/edit$/u);
  detailUrl = page.url().replace(/\/edit$/u, '');
  const crumb = await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByText(/^INC-\d{4}-\d{4} · Draft$/u)
    .textContent();
  reference = /INC-\d{4}-\d{4}/u.exec(crumb ?? '')?.[0] ?? '';
  await page
    .getByRole('combobox', { name: 'Add employee' })
    .selectOption({ label: 'Yusuf Karim · EMP-1102 · G6' });
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Proposed increase for Yusuf Karim' }),
  ).toBeVisible();

  await page.getByRole('textbox', { name: 'Proposed increase for Aisha Rahman' }).fill('5');
  await page.getByRole('textbox', { name: 'Proposed increase for Yusuf Karim' }).fill('6');
  await completeCriteria(page);
  await page.getByRole('button', { name: 'Assess criteria for Yusuf Karim' }).click();
  await expect(
    page.getByRole('heading', { name: '2. Eligibility criteria for Yusuf Karim' }),
  ).toBeVisible();
  await completeCriteria(page);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Submit to Sirius HR' }).click();
  await page.getByRole('button', { name: 'Yes, submit to Sirius HR' }).click();
  await page.waitForURL(`${detailUrl}?submitted=1`);
  expect(errors).toEqual([]);
});

test('Sirius HR verifies and approves one employee, and returns the other', async ({ page }) => {
  const errors = watchForErrors(page);
  await signIn(page, 'reviewer');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Review Queue' }).click();
  await page.waitForURL('/review');
  await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible();

  await openInQueue(page, 'Aisha Rahman');
  await expect(nav.getByRole('link', { name: 'Review Queue' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const decide = page.getByRole('region', { name: 'Decision' });
  // Approving waits for every criterion to be verified (R1-09).
  await expect(decide.getByText('Verify 5 more criteria before approving.')).toBeVisible();
  await expect(decide.getByRole('button', { name: 'Approve Aisha Rahman' })).toBeDisabled();
  await verifyAll(page, 'Aisha Rahman');
  await expect(decide.getByRole('button', { name: 'Approve Aisha Rahman' })).toBeEnabled();
  await decide.getByRole('button', { name: 'Approve Aisha Rahman' }).click();
  await expect(page.getByText('Aisha Rahman approved.')).toBeVisible();
  await expect(page.getByText(/^Approved as proposed: 5%/u)).toBeVisible();

  await page.getByRole('link', { name: 'Next employee: Yusuf Karim' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Yusuf Karim' })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Decision' });
  await panel.getByRole('tab', { name: 'Return' }).click();
  // A return needs a reason and a comment: refused without them, keeping the tab.
  await panel.getByRole('button', { name: 'Return Yusuf Karim' }).click();
  await expect(panel.getByRole('alert')).toHaveText('Choose a reason and write a comment.');
  await expect(panel.getByRole('tab', { name: 'Return' })).toHaveAttribute('aria-selected', 'true');
  await panel
    .getByRole('combobox', { name: /Reason/u })
    .selectOption({ label: 'Missing evidence' });
  await panel
    .getByRole('textbox', { name: /Comment/u })
    .fill('Attach the signed 2026 appraisal for C1, and lower the proposal to 4%.');
  await panel.getByRole('button', { name: 'Return Yusuf Karim' }).click();
  await expect(page.getByText('Yusuf Karim returned to Subsidiary A.')).toBeVisible();
  await expect(page.getByText('Returned to Subsidiary A', { exact: true })).toBeVisible();

  // The request is back with the subsidiary.
  await page.goto(detailUrl);
  await expect(page.getByText('1 employee is back with Subsidiary A')).toBeVisible();
  const row = (name: string) =>
    page
      .getByRole('table', { name: `Employees in ${reference}` })
      .getByRole('row')
      .filter({ hasText: name });
  await expect(row('Aisha Rahman')).toContainText('Approved');
  await expect(row('Yusuf Karim')).toContainText('Returned');
  expect(errors).toEqual([]);
});

test('Sirius HR asks a question about an employee [R1-08]', async ({ page }) => {
  const errors = watchForErrors(page);
  await signIn(page, 'reviewer');
  await openInQueue(page, 'Aisha Rahman');
  const card = page.getByRole('region', { name: 'Questions and answers' });
  await expect(card.getByText('No questions yet.')).toBeVisible();
  await card.getByRole('textbox', { name: 'Message' }).fill('Please confirm Aisha’s 2026 rating.');
  await card.getByRole('button', { name: 'Send' }).click();
  await expect(card.getByRole('list', { name: 'Messages about Aisha Rahman' })).toContainText(
    'Please confirm Aisha’s 2026 rating.',
  );
  await expect(card.getByText('Waiting for SUB-A')).toBeVisible();
  await expect(card.getByRole('textbox', { name: 'Message' })).toHaveValue('');
  expect(errors).toEqual([]);
});

test('the subsidiary answers from Conversations [R1-08]', async ({ page }) => {
  const errors = watchForErrors(page);
  await signIn(page, 'alphaHr');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Conversations' })
    .click();
  await page.waitForURL('/conversations');
  const row = page
    .getByRole('row')
    .filter({ hasText: reference })
    .filter({ hasText: 'Aisha Rahman' });
  await expect(row).toContainText('Please confirm Aisha’s 2026 rating.');
  await row.getByRole('link', { name: 'Respond about Aisha Rahman' }).click();
  await page.waitForURL(/#conversation$/u);
  const card = page.getByRole('region', { name: 'Questions and answers' });
  await expect(card.getByText('Waiting for your answer')).toBeVisible();
  await card
    .getByRole('textbox', { name: 'Message' })
    .fill('Rated 4 of 5; the signed form is on C1.');
  await card.getByRole('button', { name: 'Send' }).click();
  await expect(card.getByText('Waiting for Sirius HR')).toBeVisible();
  // The question is answered: nothing waits for the subsidiary about Aisha any more.
  await page.goto('/conversations');
  await expect(
    page.getByRole('row').filter({ hasText: reference }).filter({ hasText: 'Aisha Rahman' }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the subsidiary answers the question and resubmits', async ({ page }) => {
  const errors = watchForErrors(page);
  await signIn(page, 'alphaHr');
  await page.goto('/notifications?filter=action_needed');
  const notice = page
    .getByRole('listitem')
    .filter({ hasText: reference })
    .filter({ hasText: 'Yusuf Karim returned by Sirius HR' });
  await expect(notice).toContainText('Action needed');
  await notice.getByRole('button', { name: 'Respond' }).click();
  await page.waitForURL(detailUrl);
  await expect(page.getByText('Sirius HR returned 1 employee to you')).toBeVisible();
  await expect(
    page.getByText('“Attach the signed 2026 appraisal for C1, and lower the proposal to 4%.”'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Update and resubmit' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Update returned employees' }),
  ).toBeVisible();
  // Aisha stays with Sirius HR: only Yusuf can change.
  await expect(
    page.getByRole('textbox', { name: 'Proposed increase for Aisha Rahman' }),
  ).toHaveCount(0);
  await expect(page.getByText('Sirius HR asks')).toBeVisible();
  await page.getByRole('textbox', { name: 'Proposed increase for Yusuf Karim' }).fill('4');
  await page
    .getByLabel('Attach a file for C1')
    .setInputFiles({ name: 'appraisal-2026-signed.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(
    page.getByRole('link', { name: 'Download appraisal-2026-signed.pdf' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Resubmit to Sirius HR' }).click();
  const dialog = page.getByRole('alertdialog', { name: `Resubmit ${reference} to Sirius HR?` });
  await expect(dialog.getByRole('table', { name: 'Employees to submit' })).toContainText(
    'Yusuf Karim',
  );
  await expect(dialog.getByRole('table', { name: 'Employees to submit' })).not.toContainText(
    'Aisha Rahman',
  );
  await dialog
    .getByRole('textbox', { name: 'Note to Sirius HR (optional)' })
    .fill('Signed appraisal attached; proposal lowered to 4%.');
  await dialog.getByRole('button', { name: 'Yes, resubmit' }).click();
  await page.waitForURL(`${detailUrl}?resubmitted=1`);
  await expect(page.getByText('Resubmitted to Sirius HR.')).toBeVisible();
  await expect(page.getByText(/ · With Sirius HR$/u)).toBeVisible();
  expect(errors).toEqual([]);
});

test('Sirius HR checks the resubmitted employee again and approves another increment', async ({
  page,
}) => {
  const errors = watchForErrors(page);
  await signIn(page, 'reviewer');
  await page.goto('/notifications');
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: reference })
      .filter({ hasText: 'SUB-A resubmitted 1 returned employee' }),
  ).toBeVisible();

  await openInQueue(page, 'Yusuf Karim');
  // Checked again from scratch.
  await expect(
    page
      .getByRole('region', { name: 'Decision' })
      .getByText('Verify 5 more criteria before approving.'),
  ).toBeVisible();
  await verifyAll(page, 'Yusuf Karim');
  const panel = page.getByRole('region', { name: 'Decision' });
  await panel.getByRole('checkbox', { name: 'Approve a different increment' }).check();
  await panel.getByRole('textbox', { name: /Approved increment/u }).fill('3.5');
  await panel.getByRole('combobox', { name: /Reason/u }).selectOption({ label: 'Budget' });
  await panel
    .getByRole('textbox', { name: /Comment/u })
    .fill('Within the 2026 budget band for G6.');
  await panel.getByRole('button', { name: 'Approve Yusuf Karim' }).click();
  await expect(page.getByText('Yusuf Karim approved.')).toBeVisible();
  await expect(page.getByText(`Every employee of ${reference} is decided.`)).toBeVisible();
  await expect(page.getByText(/^Approved at 3\.5% instead of 4%/u)).toBeVisible();

  // The Request Tracker shows it closed, filtered to Subsidiary A.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Request Tracker' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Subsidiary' }).selectOption({ label: 'SUB-A' });
  await page.waitForURL(/entity=/u);
  await page.getByRole('searchbox', { name: 'Search' }).fill(reference);
  const row = page.getByRole('row').filter({ hasText: reference });
  await expect(row).toContainText('Approved');
  await expect(row).toContainText('Decided');
  await expect(row).toContainText('Closed');
  expect(errors).toEqual([]);
});

test('the subsidiary sees the decisions and is emailed the final status [R1-13]', async ({
  page,
}) => {
  await signIn(page, 'alphaHr');
  await page.goto(detailUrl);
  await expect(page.getByText('Final status: Approved')).toBeVisible();
  await page
    .getByRole('table', { name: `Employees in ${reference}` })
    .getByRole('link', { name: 'View the status of Yusuf Karim' })
    .click();
  await expect(page.getByText(/^Approved at 3\.5% instead of 4%/u)).toBeVisible();
  await expect(page.getByText('Reason: Budget')).toBeVisible();
  await expect(page.getByText('Within the 2026 budget band for G6.')).toBeVisible();
  const decided = await waitForEmail('pf.alpha.hr@sirius.local', `${reference} decided`);
  expect(decided.subject).toBe(`${reference} decided: Approved`);
  // Display values only: never pay or comments.
  expect(decided.text).not.toContain('budget band');
  expect(decided.text).not.toMatch(/16,?800/u);
});

test('the history tells the whole story, and RP-01 downloads in Excel and PDF [R1-14, R1-15]', async ({
  page,
}) => {
  const errors = watchForErrors(page);
  await signIn(page, 'alphaHr');
  await page.goto(detailUrl);
  const history = page.getByRole('table', { name: `History of ${reference}` });
  await expect(history).toContainText('Submitted to Sirius HR');
  await expect(history).toContainText('Yusuf Karim returned to the subsidiary');
  await expect(history).toContainText('Returned employees resubmitted (1)');
  await expect(history).toContainText('Aisha Rahman approved');
  await page.goto(`/reports?cycle=all&q=${reference}`);
  await expect(page.getByText('1 request · 2 employees match')).toBeVisible();
  for (const [name, fileName] of [
    ['Download Excel', /^PeopleForge-RP-01-\d{4}-\d{2}-\d{2}\.xlsx$/u],
    ['Download PDF', /^PeopleForge-RP-01-\d{4}-\d{2}-\d{2}\.pdf$/u],
  ] as const) {
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(fileName);
    expect(await file.failure()).toBeNull();
  }
  expect(errors).toEqual([]);
});

test('Sirius HR finds the downloads in the audit trail [R1-15]', async ({ page }) => {
  await signIn(page, 'reviewer');
  await page.goto('/audit?q=report.downloaded');
  const trail = page.getByRole('table', { name: 'Audit trail' });
  await expect(
    trail.getByRole('row').filter({ hasText: 'Report downloaded' }).first(),
  ).toContainText('format: pdf');
  await trail
    .getByRole('link', { name: /^Show only the actions of / })
    .first()
    .click();
  await expect(page.getByText(/^Actions of /u)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Show everyone' })).toBeVisible();
});

test('Sirius HR sees TAT and back-and-forth, and downloads RP-02 [R1-11, R1-12]', async ({
  page,
}) => {
  const errors = watchForErrors(page);
  await signIn(page, 'reviewer');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Analytics' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'TAT and back-and-forth' }),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: 'Requests, longest first' })).toContainText(
    reference,
  );
  await expect(page.getByRole('table', { name: 'TAT by criterion' })).toContainText('C1');
  await page.getByRole('link', { name: 'Back-and-forth' }).click();
  await page.waitForURL(/view=flow/u);
  const flows = page.getByRole('table', {
    name: 'Requests with back-and-forth, most time with the subsidiary first',
  });
  // Yusuf was returned once and asked about once.
  await expect(flows.getByRole('row').filter({ hasText: reference })).toContainText('Approved');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download RP-02 (Excel)' }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^PeopleForge-RP-02-\d{4}-\d{2}-\d{2}\.xlsx$/u,
  );
  expect(errors).toEqual([]);
});

test('another subsidiary can’t review or see any of it', async ({ page }) => {
  await signIn(page, 'betaHr');
  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.goto(detailUrl);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  // Nor the audit trail or the analytics (Sirius HR only).
  for (const path of ['/audit', '/analytics']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  }
});
