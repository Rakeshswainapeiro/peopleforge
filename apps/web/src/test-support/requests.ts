import type { CriterionAssessment, IncrementRequest } from '@peopleforge/contracts';

/** Synthetic request fixtures for the web tests (shape: @peopleforge/contracts). */
export const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
export const LINE_1 = '22222222-2222-4222-8222-222222222221';
export const LINE_2 = '22222222-2222-4222-8222-222222222222';
export const EVIDENCE_ID = '55555555-5555-4555-8555-555555555551';
export const CRITERION_IDS = [0, 1, 2, 3, 4].map(
  (index) => `44444444-4444-4444-8444-44444444444${String(index)}`,
);
const ENTITY = '00000000-0000-4000-8000-0000000e000a';
const PDF = 'application/pdf';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Nothing assessed yet for this criterion. */
export function notStarted(criterionId: string): CriterionAssessment {
  return {
    criterionId,
    result: null,
    justification: '',
    evidence: [],
    missing: ['result', 'justification', 'evidence'],
  };
}

/** Omar: C1 passed with a file, C2 failed (complete), C3 chosen but unexplained, C4–C5 open. */
export function omarCriteria(): CriterionAssessment[] {
  const [c1, c2, c3, c4, c5] = CRITERION_IDS.map(String);
  return [
    {
      criterionId: String(c1),
      result: 'pass',
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
    },
    {
      criterionId: String(c2),
      result: 'fail',
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
    },
    {
      criterionId: String(c3),
      result: 'pass',
      justification: '',
      evidence: [],
      missing: ['justification', 'evidence'],
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
    })),
    version: 3,
    createdAt: '2026-10-14T07:00:00.000Z',
    updatedAt: '2026-10-14T07:05:00.000Z',
    submittedAt: null,
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

/** The value, or a failed test: keeps fixtures typed without non-null assertions. */
export function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Fixture value missing');
  return value;
}
