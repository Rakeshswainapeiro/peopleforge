import { describe, expect, it } from 'vitest';
import { receivedJob, REQUEST_ID, submittedJob } from '../test-support/jobs.js';
import { escapeHtml, linkFor, renderEmail, unknownKeys, type RenderOptions } from './templates.js';

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
