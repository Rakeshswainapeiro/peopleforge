import type {
  AuditEvent,
  CriteriaSettings,
  IncrementAnalytics,
  ConversationPage,
  CriterionAssessment,
  Cycle,
  DashboardSummary,
  IncrementRequest,
  IncrementRequestPage,
  Message,
  RequestLine,
  RequestLinePage,
  ReviewQueuePage,
} from '@peopleforge/contracts';

/** Synthetic request fixtures for the web tests (shape: @peopleforge/contracts). */
export const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
export const LINE_1 = '22222222-2222-4222-8222-222222222221';
export const LINE_2 = '22222222-2222-4222-8222-222222222222';
export const EVIDENCE_ID = '55555555-5555-4555-8555-555555555551';
export const CRITERION_IDS = [0, 1, 2, 3, 4].map(
  (index) => `44444444-4444-4444-8444-44444444444${String(index)}`,
);
export const ENTITY = '00000000-0000-4000-8000-0000000e000a';
export const CYCLE_ID = '00000000-0000-4000-8000-00000000c026';
const PDF = 'application/pdf';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Nothing assessed yet for this criterion. */
export function notStarted(criterionId: string): CriterionAssessment {
  return {
    criterionId,
    result: null,
    measuredValue: null,
    justification: '',
    evidence: [],
    missing: ['result', 'justification', 'evidence'],
    verification: null,
  };
}

/** Omar: C1 passed with a file, C2 failed (complete), C3 chosen but unexplained, C4–C5 open. */
export function omarCriteria(): CriterionAssessment[] {
  const [c1, c2, c3, c4, c5] = CRITERION_IDS.map(String);
  return [
    {
      criterionId: String(c1),
      result: 'pass',
      measuredValue: null,
      justification: 'Rated 4 of 5 in the 2026 appraisal.',
      evidence: [
        {
          id: EVIDENCE_ID,
          fileName: 'appraisal-2026.pdf',
          mediaType: PDF,
          sizeBytes: 2048,
          createdAt: '2026-10-14T07:02:00.000Z',
        },
      ],
      missing: [],
      verification: null,
    },
    {
      criterionId: String(c2),
      result: 'fail',
      measuredValue: null,
      justification: 'Joined in March 2026.',
      evidence: [
        {
          id: '55555555-5555-4555-8555-555555555552',
          fileName: 'contract.png',
          mediaType: 'image/png',
          sizeBytes: 3 * 1024 * 1024,
          createdAt: '2026-10-14T07:03:00.000Z',
        },
      ],
      missing: [],
      verification: null,
    },
    {
      criterionId: String(c3),
      result: 'pass',
      measuredValue: null,
      justification: '',
      evidence: [],
      missing: ['justification', 'evidence'],
      verification: null,
    },
    notStarted(String(c4)),
    { ...notStarted(String(c5)), missing: ['result', 'justification'] },
  ];
}

export function draftRequest(overrides: Partial<IncrementRequest> = {}): IncrementRequest {
  return {
    id: REQUEST_ID,
    reference: 'INC-2026-0001',
    status: 'draft',
    entity: { id: ENTITY, code: 'SUB-A', name: { en: 'Subsidiary A' } },
    cycle: { id: ENTITY, name: { en: 'Increment cycle 2026' }, submissionDeadline: '2026-11-30' },
    criteria: CRITERION_IDS.map((id, index) => ({
      id,
      code: `C${String(index + 1)}`,
      name: { en: `[Placeholder] Criterion ${String(index + 1)}` },
      description: { en: `What criterion ${String(index + 1)} asks for.` },
      justificationRequired: true,
      evidencePolicy: index === 4 ? ('optional' as const) : ('required' as const),
      allowedMediaTypes: [PDF, 'image/png', 'image/jpeg', XLSX],
      maxFileMb: 10,
      threshold: null,
    })),
    version: 3,
    createdAt: '2026-10-14T07:00:00.000Z',
    updatedAt: '2026-10-14T07:05:00.000Z',
    submittedAt: null,
    submittedByName: null,
    statusChangedAt: '2026-10-14T07:00:00.000Z',
    decidedAt: null,
    stage: { kind: 'not_submitted', of: 5 },
    lines: [
      {
        id: LINE_1,
        employeeId: LINE_1,
        employeeNumber: 'EMP-3318',
        fullName: 'Omar Haddad',
        grade: 'G7',
        currency: 'AED',
        currentSalary: '21500.00',
        proposedKind: 'percent',
        proposedValue: '8.00',
        increase: '1720.00',
        newSalary: '23220.00',
        percent: '8.00',
        criteria: omarCriteria(),
        reviewStatus: 'pending',
        decision: null,
      },
      {
        id: LINE_2,
        employeeId: LINE_2,
        employeeNumber: 'EMP-3324',
        fullName: 'Neha Iyer',
        grade: 'G6',
        currency: 'AED',
        currentSalary: '16800.00',
        proposedKind: null,
        proposedValue: null,
        increase: null,
        newSalary: null,
        percent: null,
        criteria: CRITERION_IDS.map((id) => notStarted(id)),
        reviewStatus: 'pending',
        decision: null,
      },
    ],
    totals: {
      employees: 2,
      proposed: 1,
      ready: 0,
      increaseByCurrency: [{ currency: 'AED', amount: '1720.00' }],
      averagePercent: '8.0',
    },
    ...overrides,
  };
}

/** A request as Figma's "Request detail" shows it: submitted by Priya Nair at 11:14 Dubai time. */
export function submittedRequest(overrides: Partial<IncrementRequest> = {}): IncrementRequest {
  const draft = draftRequest();
  return draftRequest({
    reference: 'INC-2026-0152',
    status: 'submitted',
    submittedAt: '2026-10-15T07:14:00.000Z',
    submittedByName: 'Priya Nair',
    statusChangedAt: '2026-10-15T07:14:00.000Z',
    stage: { kind: 'criterion', criterion: 1, of: 5 },
    lines: draft.lines.map((line) => ({
      ...line,
      criteria: line.criteria.map((criterion) => ({
        ...criterion,
        result: criterion.result ?? 'pass',
        missing: [],
      })),
    })),
    ...overrides,
  });
}

/** The value, or a failed test: keeps fixtures typed without non-null assertions. */
export function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Fixture value missing');
  return value;
}

export const OPEN_CYCLE: Cycle = {
  id: CYCLE_ID,
  name: { en: 'Increment cycle 2026' },
  startsOn: '2026-01-01',
  endsOn: '2026-12-31',
  submissionDeadline: '2026-11-30',
  status: 'open',
};

export function dashboardSummaryFixture(
  overrides: Partial<DashboardSummary> = {},
): DashboardSummary {
  return {
    byStatus: {
      draft: 1,
      submitted: 2,
      under_review: 1,
      returned: 1,
      approved: 2,
      partly_approved: 1,
      rejected: 1,
    },
    requests: 3,
    employees: 7,
    funnel: { criteria: [2, 1, 0, 0, 0], decision: 1, withSubsidiary: 0, decided: 4 },
    ...overrides,
  };
}

type RequestSummary = IncrementRequestPage['items'][number];

/** A draft with 4 employees, 15 of 20 criteria complete (Figma "Needs your action"). */
export function requestSummary(overrides: Partial<RequestSummary> = {}): RequestSummary {
  return {
    id: REQUEST_ID,
    reference: 'INC-2026-0150',
    status: 'draft',
    entity: { id: ENTITY, code: 'SUB-A' },
    cycleId: CYCLE_ID,
    employeeCount: 4,
    createdAt: '2026-10-08T07:00:00.000Z',
    submittedAt: null,
    statusChangedAt: '2026-10-08T07:00:00.000Z',
    stage: { kind: 'not_submitted', of: 5 },
    criteria: { complete: 15, total: 20 },
    ...overrides,
  };
}

export function requestPage(
  items: RequestSummary[] = [requestSummary()],
  overrides: Partial<IncrementRequestPage> = {},
): IncrementRequestPage {
  return { items, page: 1, pageSize: 10, total: items.length, ...overrides };
}

type LineSummary = RequestLinePage['items'][number];

export function lineSummary(overrides: Partial<LineSummary> = {}): LineSummary {
  return {
    id: LINE_1,
    request: {
      id: REQUEST_ID,
      reference: 'INC-2026-0152',
      status: 'submitted',
      entityCode: 'SUB-A',
    },
    employeeNumber: 'EMP-3318',
    fullName: 'Omar Haddad',
    grade: 'G7',
    proposedPercent: '8.00',
    criteria: CRITERION_IDS.map((criterionId, index) => ({
      criterionId,
      code: `C${String(index + 1)}`,
      mark: index === 4 ? 'fail' : 'pass',
    })),
    status: 'submitted',
    reviewStatus: 'pending',
    updatedAt: '2026-10-10T07:00:00.000Z',
    ...overrides,
  };
}

export function linePage(
  items: LineSummary[] = [lineSummary()],
  overrides: Partial<RequestLinePage> = {},
): RequestLinePage {
  return { items, page: 1, pageSize: 10, total: items.length, ...overrides };
}

type QueueItem = ReviewQueuePage['items'][number];

/** Omar waiting for Sirius HR since 14 Oct, 2 of 5 criteria verified (Figma "Review queue"). */
export function queueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    lineId: LINE_1,
    request: {
      id: REQUEST_ID,
      reference: 'INC-2026-0152',
      status: 'under_review',
      entity: { id: ENTITY, code: 'SUB-A' },
      stage: { kind: 'criterion', criterion: 2, of: 5 },
    },
    employeeNumber: 'EMP-3318',
    fullName: 'Omar Haddad',
    grade: 'G7',
    proposedPercent: '8.00',
    criteria: CRITERION_IDS.map((criterionId, index) => ({
      criterionId,
      code: `C${String(index + 1)}`,
      mark: index === 1 ? 'fail' : 'pass',
    })),
    verified: 2,
    reviewStatus: 'pending',
    waitingSince: '2026-10-14T07:00:00.000Z',
    overdue: true,
    ...overrides,
  };
}

export function queuePage(
  items: QueueItem[] = [queueItem()],
  overrides: Partial<ReviewQueuePage> = {},
): ReviewQueuePage {
  return {
    items,
    page: 1,
    pageSize: 10,
    total: items.length,
    counts: {
      all: 6,
      pending: 3,
      returned: 1,
      overdue: 1,
      open: 4,
      openRequests: 2,
      openEntities: 2,
    },
    reminderDays: 2,
    ...overrides,
  };
}

/** Sara verified this criterion on 16 Oct. */
export const VERIFIED = { at: '2026-10-16T06:00:00.000Z', byName: 'Sara Al Mansoori' };

/** A decision as the API returns it (defaults: approved as proposed by Sara on 16 Oct). */
export function decisionOf(
  overrides: Partial<NonNullable<RequestLine['decision']>> = {},
): NonNullable<RequestLine['decision']> {
  return {
    decision: 'approved',
    reasonCode: null,
    comment: '',
    approvedPercent: null,
    approvedIncrease: '1720.00',
    approvedSalary: '23220.00',
    decidedAt: '2026-10-16T08:30:00.000Z',
    decidedByName: 'Sara Al Mansoori',
    ...overrides,
  };
}

/** Sara asked about Omar on 16 Oct; Alpha HR answered (synthetic). */
export function threadMessages(): Message[] {
  return [
    {
      id: '66666666-6666-4666-8666-666666666661',
      side: 'sirius',
      authorName: 'Sara Al Mansoori',
      body: 'Is the 2026 appraisal signed?',
      createdAt: '2026-10-16T06:00:00.000Z',
    },
    {
      id: '66666666-6666-4666-8666-666666666662',
      side: 'subsidiary',
      authorName: 'Alpha HR',
      body: 'Yes — signed copy attached to C1.',
      createdAt: '2026-10-16T07:30:00.000Z',
    },
  ];
}

type ThreadItem = ConversationPage['items'][number];

export function threadItem(overrides: Partial<ThreadItem> = {}): ThreadItem {
  return {
    lineId: LINE_1,
    request: { id: REQUEST_ID, reference: 'INC-2026-0152', entityCode: 'SUB-A' },
    employeeNumber: 'EMP-3318',
    fullName: 'Omar Haddad',
    messages: 2,
    awaitingMe: true,
    last: {
      side: 'sirius',
      authorName: 'Sara Al Mansoori',
      createdAt: '2026-10-16T06:00:00.000Z',
      preview: 'Is the 2026 appraisal signed?',
    },
    ...overrides,
  };
}

export function conversationPage(
  items: ThreadItem[] = [threadItem()],
  overrides: Partial<ConversationPage> = {},
): ConversationPage {
  return {
    items,
    page: 1,
    pageSize: 10,
    total: items.length,
    counts: { all: 4, awaiting: items.length },
    ...overrides,
  };
}

/** An audit-trail entry as the API returns it (R1-15). */
export function auditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: '9001',
    at: '2026-10-15T07:14:00.000Z',
    actor: 'oid-4',
    actorName: 'Priya Nair',
    action: 'increment_request.submitted',
    entityId: ENTITY,
    subjectType: 'increment_request',
    subjectId: REQUEST_ID,
    details: { reference: 'INC-2026-0152', from: 'draft', to: 'submitted' },
    ...overrides,
  };
}

/** The active criteria as the settings API returns them (R1-05). */
export function criteriaSettings(overrides: Partial<CriteriaSettings> = {}): CriteriaSettings {
  return {
    id: '00000000-0000-4000-8000-0000000c5e71',
    version: 1,
    activatedAt: '2026-10-01T06:00:00.000Z',
    criteria: draftRequest().criteria,
    ...overrides,
  };
}

/** TAT and back-and-forth as the analytics API returns them (R1-11, R1-12). */
export function incrementAnalytics(
  overrides: Partial<IncrementAnalytics> = {},
): IncrementAnalytics {
  const longest = {
    id: REQUEST_ID,
    reference: 'INC-2026-0152',
    entityCode: 'SUB-A',
    status: 'returned' as const,
    employees: 2,
    submittedAt: '2026-10-15T07:14:00.000Z',
    decidedAt: null,
    days: '2.5',
    open: true,
  };
  return {
    generatedAt: '2026-10-18T06:00:00.000Z',
    tat: {
      requests: 2,
      decided: 1,
      averageDays: '4.5',
      medianDays: '4.5',
      open: 1,
      openAverageDays: '2.5',
      longestOpen: longest,
      byCriterion: [
        { code: 'C1', verified: 3, averageDays: '0.8', medianDays: '0.5', maxDays: '1.0' },
        { code: 'C2', verified: 1, averageDays: '2.0', medianDays: '2.0', maxDays: '2.0' },
      ],
      trend: [
        { month: '2026-09', count: 0, averageDays: null, medianDays: null },
        { month: '2026-10', count: 1, averageDays: '4.5', medianDays: '4.5' },
      ],
      criteria: ['C1', 'C2'],
      byEntity: [
        {
          entityCode: 'SUB-A',
          requests: 2,
          decided: 1,
          averageDays: '4.5',
          openAverageDays: '2.5',
        },
      ],
      byRequest: [
        {
          ...longest,
          id: '11111111-1111-4111-8111-111111111119',
          reference: 'INC-2026-0150',
          status: 'approved',
          decidedAt: '2026-10-14T16:00:00.000Z',
          days: '4.5',
          open: false,
        },
        longest,
      ],
    },
    backAndForth: {
      returns: 1,
      openReturns: 1,
      averageReturnDays: '1.0',
      questions: 2,
      averageAnswerDays: null,
      byEntity: [
        {
          entityCode: 'SUB-A',
          requests: 2,
          returns: 1,
          averageReturnDays: '1.0',
          questions: 2,
          averageAnswerDays: null,
        },
      ],
      byRequest: [
        {
          id: REQUEST_ID,
          reference: 'INC-2026-0152',
          entityCode: 'SUB-A',
          status: 'returned',
          returns: 1,
          openReturns: 1,
          daysWithSubsidiary: '1.0',
          questions: 2,
          answers: 0,
          averageAnswerDays: null,
        },
      ],
    },
    ...overrides,
  };
}
