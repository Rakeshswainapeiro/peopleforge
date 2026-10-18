import { describe, expect, it } from 'vitest';
import { receivedJob, REQUEST_ID, submittedJob } from '../test-support/jobs.js';
import {
  escapeHtml,
  formatDay,
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
