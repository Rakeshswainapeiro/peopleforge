import type { IncrementRequestRecord, IncrementRequestRepository } from '@peopleforge/db';
import { ROLES } from '@peopleforge/contracts';
import { vi } from 'vitest';
import type { Principal } from '../auth/principal.js';
import { SUB_A, SUB_B, unusedRepository } from './factory.js';

export const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
export const LINE_1 = '22222222-2222-4222-8222-222222222221';
export const LINE_2 = '22222222-2222-4222-8222-222222222222';
export const EMPLOYEE_1 = '33333333-3333-4333-8333-333333333331';
export const EMPLOYEE_2 = '33333333-3333-4333-8333-333333333332';
export const CYCLE_ID = '00000000-0000-4000-8000-00000000c026';

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
    cycle: { id: CYCLE_ID, name: { en: 'Increment cycle 2026' } },
    criteriaSetId: '00000000-0000-4000-8000-0000000c5e71',
    criteria: ['C1', 'C2', 'C3', 'C4', 'C5'].map((code, index) => ({
      id: `44444444-4444-4444-8444-44444444444${String(index)}`,
      code,
      name: { en: `[Placeholder] ${code}` },
    })),
    version: 3,
    createdAt: new Date('2026-10-14T07:00:00Z'),
    updatedAt: new Date('2026-10-14T07:05:00Z'),
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
    removeLine: vi.fn(() => Promise.resolve()),
    setProposals: vi.fn(() => Promise.resolve()),
  };
}
