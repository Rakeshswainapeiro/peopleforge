import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import {
  auditEvent,
  CRITERION_IDS,
  LINE_1,
  LINE_2,
  submittedRequest,
} from '@/test-support/requests';
import { historyRows, historyText, isWorded, WORDED_ACTIONS } from './history-view';

const t = createTranslator('en');
const request = submittedRequest();
const say = (overrides: Parameters<typeof auditEvent>[0]) =>
  historyText(auditEvent(overrides), request, 'en', t);

describe('history views [R1-15]', () => {
  it('words every recorded action, naming employees and criteria from the request', () => {
    expect(say({ action: 'increment_request.created', details: { employees: 2 } })).toBe(
      'Request created (2 employees)',
    );
    expect(say({ action: 'request_line.added', details: { employeeId: LINE_2 } })).toBe(
      'Neha Iyer added',
    );
    expect(
      say({
        action: 'evidence.uploaded',
        subjectType: 'evidence_file',
        details: { lineId: LINE_1, criterionId: String(CRITERION_IDS[1]) },
      }),
    ).toBe('File attached for Omar Haddad · C2');
    expect(
      say({
        action: 'criterion.verified',
        subjectType: 'request_line',
        subjectId: LINE_2,
        details: { criterionId: String(CRITERION_IDS[4]) },
      }),
    ).toBe('C5 verified for Neha Iyer');
    expect(say({})).toBe('Submitted to Sirius HR');
    expect(
      say({
        action: 'increment_request.status_changed',
        details: { from: 'submitted', to: 'under_review' },
      }),
    ).toBe('Status changed: Submitted → Under review');
    expect(
      say({
        action: 'report.downloaded',
        subjectType: 'report',
        subjectId: 'RP-01',
        details: { format: 'pdf' },
      }),
    ).toBe('Report RP-01 downloaded (PDF)');
  });

  it('says so plainly when a name, code or status is unknown, and shows unknown actions as codes', () => {
    // A removed employee and a criterion not on the request.
    expect(
      say({
        action: 'criterion.unverified',
        subjectType: 'request_line',
        subjectId: '22222222-2222-4222-8222-22222222ffff',
        details: { criterionId: 'gone' },
      }),
    ).toBe('a criterion check undone for an employee');
    expect(
      say({ action: 'increment_request.status_changed', details: { from: 'odd', to: null } }),
    ).toBe('Status changed: odd → ');
    expect(say({ action: 'report.downloaded', details: {} })).toBe('Report  downloaded ()');
    expect(say({ action: 'increment_request.created', details: { employees: 'x' } })).toBe(
      'Request created ( employees)',
    );
    expect(say({ action: 'something.new' })).toBe('something.new');
    expect(isWorded('message.posted')).toBe(true);
    expect(isWorded('constructor')).toBe(false);
    expect(WORDED_ACTIONS).toHaveLength(18);
  });

  it('builds rows with when and who, for entries before names were kept too', () => {
    expect(
      historyRows([auditEvent(), auditEvent({ id: '9002', actorName: null })], request, 'en', t),
    ).toEqual([
      {
        id: '9001',
        when: '15 Oct 2026, 11:14',
        who: 'Priya Nair',
        what: 'Submitted to Sirius HR',
      },
      {
        id: '9002',
        when: '15 Oct 2026, 11:14',
        who: 'Unknown user',
        what: 'Submitted to Sirius HR',
      },
    ]);
  });
});
