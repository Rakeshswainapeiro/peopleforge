import type { IncrementRequestRecord, IncrementRequestRepository } from '@peopleforge/db';
import { ROLES } from '@peopleforge/contracts';
import type { MalwareScanner, ObjectStore } from '@peopleforge/integrations';
import { vi, type Mock } from 'vitest';
import type { Principal } from '../auth/principal.js';
import { SUB_A, SUB_B, unusedRepository } from './factory.js';

export const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
export const LINE_1 = '22222222-2222-4222-8222-222222222221';
export const LINE_2 = '22222222-2222-4222-8222-222222222222';
export const EMPLOYEE_1 = '33333333-3333-4333-8333-333333333331';
export const EMPLOYEE_2 = '33333333-3333-4333-8333-333333333332';
export const CYCLE_ID = '00000000-0000-4000-8000-00000000c026';
export const CRITERION_IDS = [0, 1, 2, 3, 4].map(
  (index) => `44444444-4444-4444-8444-44444444444${String(index)}`,
);
export const CRITERION_1 = String(CRITERION_IDS[0]);
export const EVIDENCE_ID = '55555555-5555-4555-8555-555555555551';

/** The evidence file recorded against C1 for Omar in `record()`. */
export const evidenceRecord = {
  id: EVIDENCE_ID,
  fileName: 'appraisal-2026.pdf',
  mediaType: 'application/pdf',
  sizeBytes: 2048,
  createdAt: new Date('2026-10-14T07:02:00Z'),
};

export const alphaHr: Principal = {
  userId: 'alpha',
  username: 'pf.alpha.hr',
  name: 'Alpha HR',
  roles: [ROLES.subsidiaryHr],
  scope: 'entity',
  entityIds: [SUB_A],
};

export const twoEntityHr: Principal = { ...alphaHr, userId: 'two', entityIds: [SUB_A, SUB_B] };

export const reviewer: Principal = {
  userId: 'reviewer',
  username: 'pf.reviewer',
  name: 'Reviewer',
  roles: [ROLES.reviewer],
  scope: 'group',
};

export const executive: Principal = { ...reviewer, userId: 'exec', roles: [ROLES.executive] };

/** A stored draft as the repository returns it (salaries already decrypted). */
export function record(overrides: Partial<IncrementRequestRecord> = {}): IncrementRequestRecord {
  return {
    id: REQUEST_ID,
    reference: 'INC-2026-0001',
    status: 'draft',
    entity: { id: SUB_A, code: 'SUB-A', name: { en: 'Subsidiary A' } },
    cycle: {
      id: CYCLE_ID,
      name: { en: 'Increment cycle 2026' },
      submissionDeadline: '2026-11-30',
    },
    criteriaSetId: '00000000-0000-4000-8000-0000000c5e71',
    criteria: CRITERION_IDS.map((id, index) => ({
      id,
      code: `C${String(index + 1)}`,
      name: { en: `[Placeholder] C${String(index + 1)}` },
      description: { en: 'What the criterion asks for.' },
      justificationRequired: true,
      // The placeholder set: C5 takes files but doesn't need them.
      evidencePolicy: index === 4 ? ('optional' as const) : ('required' as const),
      allowedMediaTypes: ['application/pdf', 'image/png'],
      maxFileMb: 10,
    })),
    version: 3,
    createdAt: new Date('2026-10-14T07:00:00Z'),
    updatedAt: new Date('2026-10-14T07:05:00Z'),
    submittedAt: null,
    lines: [
      {
        id: LINE_1,
        employeeId: EMPLOYEE_1,
        employeeNumber: 'EMP-3318',
        fullName: 'Omar Haddad',
        grade: 'G7',
        currentSalary: '21500.00',
        currency: 'AED',
        proposedKind: 'percent',
        proposedValue: '8.00',
        // C1 complete; nothing saved for the others yet.
        criteria: [
          {
            criterionId: CRITERION_1,
            result: 'pass',
            justification: 'Rated 4 of 5 in the 2026 appraisal.',
            evidence: [evidenceRecord],
          },
        ],
      },
      {
        id: LINE_2,
        employeeId: EMPLOYEE_2,
        employeeNumber: 'EMP-3324',
        fullName: 'Neha Iyer',
        grade: 'G6',
        currentSalary: '16800.00',
        currency: 'AED',
        proposedKind: null,
        proposedValue: null,
        criteria: [],
      },
    ],
    ...overrides,
  };
}

/** A repository returning `record()` for reads and accepting every write. */
export function workingRepository(): IncrementRequestRepository & {
  [K in keyof IncrementRequestRepository]: ReturnType<typeof vi.fn>;
} {
  const base = unusedRepository();
  return {
    ...base,
    openCycles: vi.fn(() =>
      Promise.resolve([
        {
          id: CYCLE_ID,
          name: { en: 'Increment cycle 2026' },
          startsOn: '2026-01-01',
          endsOn: '2026-12-31',
          submissionDeadline: '2026-11-30',
          status: 'open' as const,
        },
      ]),
    ),
    searchEmployees: vi.fn(() =>
      Promise.resolve([
        { id: EMPLOYEE_1, employeeNumber: 'EMP-3318', fullName: 'Omar Haddad', grade: 'G7' },
      ]),
    ),
    create: vi.fn(() => Promise.resolve({ id: REQUEST_ID, created: true })),
    get: vi.fn(() => Promise.resolve(record())),
    list: vi.fn(() =>
      Promise.resolve({
        total: 1,
        items: [
          {
            id: REQUEST_ID,
            reference: 'INC-2026-0001',
            status: 'draft' as const,
            entityId: SUB_A,
            cycleId: CYCLE_ID,
            employeeCount: 2,
            createdAt: new Date('2026-10-14T07:00:00Z'),
            updatedAt: new Date('2026-10-14T07:05:00Z'),
          },
        ],
      }),
    ),
    addLine: vi.fn(() => Promise.resolve()),
    removeLine: vi.fn(() => Promise.resolve({ discarded: false })),
    saveDraft: vi.fn(() => Promise.resolve()),
    addEvidence: vi.fn(
      (
        _scope: unknown,
        _requestId: string,
        file: { id: string; fileName: string; mediaType: string; sizeBytes: number },
      ) =>
        Promise.resolve({
          id: file.id,
          fileName: file.fileName,
          mediaType: file.mediaType,
          sizeBytes: file.sizeBytes,
          createdAt: new Date('2026-10-14T08:00:00Z'),
        }),
    ),
    removeEvidence: vi.fn(() => Promise.resolve()),
    submit: vi.fn(() => Promise.resolve({ replayed: false })),
    recordAction: vi.fn(() => Promise.resolve()),
    getEvidence: vi.fn(() =>
      Promise.resolve({
        id: EVIDENCE_ID,
        entityId: SUB_A,
        requestStatus: 'draft' as const,
        objectKey: `evidence/${SUB_A}/${EVIDENCE_ID}`,
        fileName: evidenceRecord.fileName,
        mediaType: evidenceRecord.mediaType,
        sizeBytes: evidenceRecord.sizeBytes,
      }),
    ),
  };
}

/** A minimal PDF: enough for magic-byte detection. Synthetic, like all test data. */
export const SAMPLE_PDF = Buffer.from(
  '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
  'latin1',
);

/** A 1×1 PNG. */
export const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export type MemoryObjectStore = { objects: Map<string, Buffer> } & {
  [K in keyof ObjectStore]: Mock<ObjectStore[K]>;
};

/** An in-memory object store that records what it holds. */
export function memoryObjectStore(): MemoryObjectStore {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    put: vi.fn((key: string, body: Buffer) => {
      objects.set(key, body);
      return Promise.resolve();
    }),
    get: vi.fn((key: string) => {
      const body = objects.get(key);
      return body === undefined ? Promise.reject(new Error('missing')) : Promise.resolve(body);
    }),
    remove: vi.fn((key: string) => {
      objects.delete(key);
      return Promise.resolve();
    }),
    ping: vi.fn(() => Promise.resolve()),
  };
}

export type StubScanner = { engine: string } & {
  [K in 'scan' | 'ping']: Mock<MalwareScanner[K]>;
};

/** A scanner reporting clean unless the file contains "INFECTED". */
export function stubScanner(): StubScanner {
  return {
    engine: 'stub',
    scan: vi.fn((body: Buffer) =>
      Promise.resolve(
        body.includes('INFECTED')
          ? { clean: false as const, signature: 'Stub-Test-Signature' }
          : { clean: true as const },
      ),
    ),
    ping: vi.fn(() => Promise.resolve()),
  };
}
