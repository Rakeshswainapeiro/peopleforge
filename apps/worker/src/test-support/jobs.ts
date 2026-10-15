import type { OutboxJob } from '@peopleforge/db';

export const REQUEST_ID = '11111111-1111-4111-8111-111111111111';

/** A queued email to the submitter (synthetic data). */
export function submittedJob(overrides: Partial<OutboxJob> = {}): OutboxJob {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    attempts: 0,
    kind: 'request_submitted',
    params: { reference: 'INC-2026-0152', employees: 4 },
    requestId: REQUEST_ID,
    recipient: { kind: 'user', userId: 'alpha', address: 'pf.alpha.hr@sirius.local' },
    ...overrides,
  };
}

/** A queued email to the Sirius HR reviewers' mailbox. */
export function receivedJob(overrides: Partial<OutboxJob> = {}): OutboxJob {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    attempts: 0,
    kind: 'request_received',
    params: { reference: 'INC-2026-0152', employees: 1, entity: 'SUB-A', actor: 'Priya Nair' },
    requestId: REQUEST_ID,
    recipient: { kind: 'role', role: 'PeopleForge.Reviewer', address: 'pf.reviewers@sirius.local' },
    ...overrides,
  };
}
