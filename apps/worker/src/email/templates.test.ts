import { describe, expect, it } from 'vitest';
import { receivedJob, REQUEST_ID, submittedJob } from '../test-support/jobs.js';
import {
  escapeHtml,
  formatDay,
  formatMonth,
  linkFor,
  renderEmail,
  unknownKeys,
  type RenderOptions,
} from './templates.js';

const OPTIONS: RenderOptions = { portalUrl: 'https://hr.example.ae', locale: 'en' };

function rendered(job = submittedJob(), options = OPTIONS) {
  const result = renderEmail(job, options);
  if (!result.ok) throw new Error(result.reason);
  return result.email;
}

describe('renderEmail [R1-07, R1-13]', () => {
  it('tells the submitter their request went to Sirius HR, with a link to it', () => {
    const email = rendered();
    expect(email.subject).toBe('INC-2026-0152 submitted to Sirius HR');
    expect(email.text).toContain(
      'Your increment request INC-2026-0152 with 4 employees was submitted to Sirius HR.',
    );
    expect(email.text).toContain(
      `Open it in PeopleForge: https://hr.example.ae/requests/${REQUEST_ID}`,
    );
    expect(email.text).toContain('[Legal footer pending from Sirius Group]');
    expect(email.html).toContain(`href="https://hr.example.ae/requests/${REQUEST_ID}"`);
    expect(email.html).toContain('<html lang="en" dir="ltr">');
  });

  it('tells Sirius HR reviewers who submitted what, in the singular for one employee', () => {
    const email = rendered(receivedJob());
    expect(email.subject).toBe('New increment request INC-2026-0152 from SUB-A');
    expect(email.text).toContain(
      'Priya Nair submitted increment request INC-2026-0152 from SUB-A with 1 employee.',
    );
  });

  it('never carries pay or justifications: only the display values it was given', () => {
    const email = rendered(
      submittedJob({
        params: { reference: 'INC-2026-0152', employees: 4, salary: '21500.00', note: 'x' },
      }),
    );
    expect(email.text).not.toContain('21500');
    expect(email.html).not.toContain('21500');
  });

  it('escapes names in the HTML part', () => {
    const email = rendered(
      receivedJob({
        params: {
          reference: 'INC-2026-0152',
          employees: 2,
          entity: 'SUB-A',
          actor: '<a href="https://evil.example">Click</a>',
        },
      }),
    );
    expect(email.html).not.toContain('<a href="https://evil.example">');
    expect(email.html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;Click&lt;/a&gt;');
  });

  it('writes Arabic emails right to left, falling back to English text until translated', () => {
    const email = rendered(submittedJob(), { ...OPTIONS, locale: 'ar' });
    expect(email.html).toContain('<html lang="ar" dir="rtl">');
    expect(email.text.startsWith('مرحباً،')).toBe(true);
    expect(email.subject).toBe('INC-2026-0152 submitted to Sirius HR');
  });

  it.each([
    [{ kind: 'salary_changed' }, 'unknown_kind'],
    [{ kind: 'toString' }, 'unknown_kind'],
    [{ params: { reference: 'INC-2026-0152' } }, 'invalid_params'],
    [{ params: { reference: 'INC\r\nBcc: x@y.ae', employees: 1 } }, 'invalid_params'],
    [{ params: { reference: 'INC-1', employees: 1.5 } }, 'invalid_params'],
  ])('refuses %j', (overrides, reason) => {
    expect(renderEmail(submittedJob(overrides), OPTIONS)).toEqual({ ok: false, reason });
  });
});

describe('review emails [R1-08, R1-09, R1-10]', () => {
  const job = (kind: string, params: Record<string, string | number>) =>
    rendered(submittedJob({ kind, params }));

  it('tells the submitter the stage moved', () => {
    const email = job('stage_changed', { reference: 'INC-2026-0152', criterion: 3, of: 5 });
    expect(email.subject).toBe('INC-2026-0152: criterion 3 of 5 under review');
    expect(email.text).toContain('Criterion 3 of 5 is now under review.');
  });

  it.each([
    ['employee_approved', 'Aisha Rahman approved in INC-2026-0152'],
    ['employee_rejected', 'Aisha Rahman rejected in INC-2026-0152'],
    ['employee_returned', 'Action needed: Aisha Rahman returned in INC-2026-0152'],
  ])('words %s', (kind, subject) => {
    const email = job(kind, { reference: 'INC-2026-0152', employee: 'Aisha Rahman' });
    expect(email.subject).toBe(subject);
    expect(email.text).toContain('Aisha Rahman');
  });

  it('names the final status in words', () => {
    const email = job('request_decided', { reference: 'INC-2026-0152', status: 'partly_approved' });
    expect(email.subject).toBe('INC-2026-0152 decided: Partly approved');
    expect(
      renderEmail(
        submittedJob({ kind: 'request_decided', params: { reference: 'X', status: 'draft' } }),
        OPTIONS,
      ),
    ).toEqual({ ok: false, reason: 'invalid_params' });
  });

  it('tells reviewers what came back', () => {
    const email = rendered(
      receivedJob({
        kind: 'request_resubmitted',
        params: { reference: 'INC-2026-0152', employees: 2, entity: 'SUB-A', actor: 'Priya Nair' },
      }),
    );
    expect(email.subject).toBe('INC-2026-0152 resubmitted by SUB-A');
    expect(email.text).toContain('with 2 returned employees');
  });
});

describe('question emails [R1-08]', () => {
  const LINE = '22222222-2222-4222-8222-222222222221';

  it('says a question was asked or answered, never what, linking to the employee', () => {
    const asked = rendered(
      submittedJob({
        kind: 'question_asked',
        params: { reference: 'INC-2026-0152', employee: 'Aisha Rahman', lineId: LINE },
      }),
    );
    expect(asked.subject).toBe('Question from Sirius HR about Aisha Rahman (INC-2026-0152)');
    expect(asked.text).toContain(`https://hr.example.ae/requests/${REQUEST_ID}/employees/${LINE}`);
    const answered = rendered(
      receivedJob({
        kind: 'question_answered',
        params: {
          reference: 'INC-2026-0152',
          employee: 'Aisha Rahman',
          lineId: LINE,
          entity: 'SUB-A',
          actor: 'Priya Nair',
        },
      }),
    );
    expect(answered.subject).toBe('SUB-A answered about Aisha Rahman (INC-2026-0152)');
    expect(
      renderEmail(
        submittedJob({
          kind: 'question_asked',
          params: { reference: 'X', employee: 'Y', lineId: '../x' },
        }),
        OPTIONS,
      ),
    ).toEqual({ ok: false, reason: 'invalid_params' });
  });
});

describe('reminder emails [R1-13]', () => {
  it('reminds reviewers of employees waiting past the configured days', () => {
    const email = rendered(
      receivedJob({
        kind: 'review_overdue',
        params: { reference: 'INC-2026-0152', employees: 1, entity: 'SUB-A', days: 2 },
      }),
    );
    expect(email.subject).toBe('Reminder: INC-2026-0152 from SUB-A is waiting for review');
    expect(email.text).toContain(
      '1 employee in increment request INC-2026-0152 from SUB-A has waited more than 2 days',
    );
  });

  it('reminds the submitter of returned employees and of the deadline, as a date in words', () => {
    const returned = rendered(
      submittedJob({
        kind: 'return_overdue',
        params: { reference: 'INC-2026-0152', employees: 2, days: 3 },
      }),
    );
    expect(returned.subject).toBe('Reminder: INC-2026-0152 is waiting for your update');
    expect(returned.text).toContain(
      'returned 2 employees in increment request INC-2026-0152 more than 3 days ago',
    );
    const deadline = rendered(
      submittedJob({
        kind: 'deadline_approaching',
        params: { reference: 'INC-2026-0160', employees: 4, deadline: '2026-11-30', days: 2 },
      }),
    );
    expect(deadline.subject).toBe('Reminder: submit INC-2026-0160 by 30 Nov 2026');
    expect(deadline.text).toContain('The submission deadline is 30 Nov 2026.');
    expect(
      renderEmail(
        submittedJob({
          kind: 'deadline_approaching',
          params: { reference: 'X', employees: 1, deadline: '30/11/2026', days: 2 },
        }),
        OPTIONS,
      ),
    ).toEqual({ ok: false, reason: 'invalid_params' });
  });

  it('formats a date in the reader’s language, whatever the server’s time zone', () => {
    expect(formatDay('2026-11-30', 'en')).toBe('30 Nov 2026');
    expect(formatDay('2026-11-30', 'ar')).not.toBe('30 Nov 2026');
  });
});

describe('linkFor', () => {
  it('links to the request, or to notifications without one', () => {
    expect(linkFor('https://hr.example.ae/', REQUEST_ID)).toBe(
      `https://hr.example.ae/requests/${REQUEST_ID}`,
    );
    expect(linkFor('https://hr.example.ae', null)).toBe('https://hr.example.ae/notifications');
    expect(linkFor('https://hr.example.ae', '../../admin')).toBe(
      'https://hr.example.ae/notifications',
    );
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-special characters', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;',
    );
  });
});

describe('message files', () => {
  it('has no Arabic keys missing from English', () => {
    expect(unknownKeys('ar')).toEqual([]);
  });
});

describe('group data emails [R2-01, R2-10, R2-11]', () => {
  const UPLOAD = '66666666-6666-4666-8666-666666666661';
  const FLAG = '88888888-8888-4888-8888-888888888881';
  const job = (kind: string, params: Record<string, string | number>) =>
    submittedJob({ kind, params, requestId: null });

  it('tells reviewers an upload is in use, with its flags, linking to the upload', () => {
    const email = rendered(
      job('group_upload_accepted', {
        reference: 'UP-0007',
        entity: 'SUB-A',
        period: '2026-09',
        version: 2,
        flags: 1,
        actor: 'Priya Nair',
        uploadId: UPLOAD,
      }),
    );
    expect(email.subject).toBe('SUB-A employee data for September 2026 received (UP-0007)');
    expect(email.text).toContain('Version 2 is now in use, with 1 anomaly flag to review.');
    expect(email.text).toContain(`https://hr.example.ae/group/uploads/${UPLOAD}`);
  });

  it('tells the uploader they own the flags raised', () => {
    const email = rendered(
      job('group_flags_raised', {
        reference: 'UP-0007',
        entity: 'SUB-A',
        period: '2026-09',
        count: 3,
        uploadId: UPLOAD,
      }),
    );
    expect(email.subject).toBe('Action needed: 3 anomaly flags on SUB-A September 2026 data');
    expect(email.text).toContain('raised 3 anomaly flags. You own them');
  });

  it('words flag updates, reminders and overdue flags, linking to the flag', () => {
    const updated = rendered(
      job('flag_updated', {
        flag: 'AN-0042',
        flagId: FLAG,
        entity: 'SUB-A',
        actor: 'Sara',
        flagStatus: 'in_progress',
      }),
    );
    expect(updated.subject).toBe('Anomaly flag AN-0042 (SUB-A): In progress');
    expect(updated.text).toContain(`https://hr.example.ae/group/quality/flags/${FLAG}`);
    const reminder = rendered(
      job('flag_reminder', { flag: 'AN-0042', flagId: FLAG, entity: 'SUB-A', actor: 'Sara' }),
    );
    expect(reminder.text).toContain('Sara from Sirius HR sent a reminder');
    const open = rendered(
      job('flag_open', { flag: 'AN-0042', flagId: FLAG, entity: 'SUB-A', days: 5 }),
    );
    expect(open.subject).toBe('Reminder: anomaly flag AN-0042 (SUB-A) open for 5 days');
  });

  it('reminds a subsidiary to upload last month, linking to the upload page', () => {
    const email = rendered(job('upload_due', { entity: 'SUB-B', period: '2026-09', days: 5 }));
    expect(email.subject).toBe('Reminder: SUB-B employee data for September 2026 not uploaded');
    expect(email.text).toContain('https://hr.example.ae/group/upload');
  });

  it('refuses malformed group params', () => {
    expect(
      renderEmail(job('upload_due', { entity: 'SUB-B', period: '2026-13', days: 5 }), OPTIONS),
    ).toEqual({
      ok: false,
      reason: 'invalid_params',
    });
    expect(
      renderEmail(
        job('flag_updated', {
          flag: 'AN-1',
          flagId: FLAG,
          entity: 'A',
          actor: 'B',
          flagStatus: 'gone',
        }),
        OPTIONS,
      ),
    ).toEqual({ ok: false, reason: 'invalid_params' });
  });

  it('names months in the reader language', () => {
    expect(formatMonth('2026-09', 'en')).toBe('September 2026');
    expect(formatMonth('2026-09', 'ar')).not.toBe('September 2026');
  });
});
