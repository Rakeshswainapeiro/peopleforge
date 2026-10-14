import { describe, expect, it } from 'vitest';
import {
  CreateIncrementRequestSchema,
  DecimalString,
  EmployeeSearchQuerySchema,
  IncrementRequestSchema,
  ListIncrementRequestsQuerySchema,
  SetProposalsSchema,
} from './increment-requests.js';

const ID = '00000000-0000-4000-8000-0000000e000a';

describe('DecimalString', () => {
  it.each(['0', '8', '8.5', '1720.00', '999999999.99'])('accepts %s', (value) => {
    expect(DecimalString.safeParse(value).success).toBe(true);
  });

  it.each(['', '-1', '1.234', '1e3', '0x10', ' 8', '8,5', '1234567890', '٨'])(
    'refuses %j',
    (value) => {
      expect(DecimalString.safeParse(value).success).toBe(false);
    },
  );
});

describe('CreateIncrementRequestSchema', () => {
  it('needs a first employee and refuses unknown fields', () => {
    expect(CreateIncrementRequestSchema.parse({ cycleId: ID, employeeIds: [ID] })).toEqual({
      cycleId: ID,
      employeeIds: [ID],
    });
    expect(CreateIncrementRequestSchema.safeParse({ cycleId: ID }).success).toBe(false);
    expect(CreateIncrementRequestSchema.safeParse({ cycleId: ID, employeeIds: [] }).success).toBe(
      false,
    );
    const extra = { cycleId: ID, employeeIds: [ID], status: 'approved' };
    expect(CreateIncrementRequestSchema.safeParse(extra).success).toBe(false);
  });

  it('caps the number of employees', () => {
    const employeeIds = Array.from({ length: 201 }, () => ID);
    expect(CreateIncrementRequestSchema.safeParse({ cycleId: ID, employeeIds }).success).toBe(
      false,
    );
  });
});

describe('SetProposalsSchema', () => {
  it('takes a kind and a value together, or neither', () => {
    const parse = (kind: unknown, value: unknown) =>
      SetProposalsSchema.safeParse({ version: 1, proposals: [{ lineId: ID, kind, value }] })
        .success;
    expect(parse('percent', '8')).toBe(true);
    expect(parse(null, null)).toBe(true);
    expect(parse('amount', null)).toBe(false);
    expect(parse(null, '8')).toBe(false);
    expect(parse('bonus', '8')).toBe(false);
  });

  it('requires a positive whole version', () => {
    expect(SetProposalsSchema.safeParse({ version: 0, proposals: [] }).success).toBe(false);
    expect(SetProposalsSchema.safeParse({ version: 1.5, proposals: [] }).success).toBe(false);
  });
});

describe('ListIncrementRequestsQuerySchema', () => {
  it('reads paging from query strings with defaults', () => {
    expect(ListIncrementRequestsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    expect(
      ListIncrementRequestsQuerySchema.parse({ status: 'draft', page: '3', pageSize: '25' }),
    ).toEqual({
      status: 'draft',
      page: 3,
      pageSize: 25,
    });
  });

  it('refuses page sizes outside the offered ones', () => {
    expect(ListIncrementRequestsQuerySchema.safeParse({ pageSize: '1000' }).success).toBe(false);
    expect(ListIncrementRequestsQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('EmployeeSearchQuerySchema', () => {
  it('trims the search and bounds it', () => {
    expect(EmployeeSearchQuerySchema.parse({ entityId: ID, search: ' omar ' })).toEqual({
      entityId: ID,
      search: 'omar',
    });
    expect(
      EmployeeSearchQuerySchema.safeParse({ entityId: ID, search: 'x'.repeat(101) }).success,
    ).toBe(false);
  });
});

describe('IncrementRequestSchema', () => {
  it('accepts a documented response', () => {
    const response = {
      id: ID,
      reference: 'INC-2026-0001',
      status: 'draft',
      entity: { id: ID, code: 'SUB-A', name: { en: 'Subsidiary A' } },
      cycle: { id: ID, name: { en: 'Increment cycle 2026' } },
      criteria: [{ id: ID, code: 'C1', name: { en: '[Placeholder] Performance rating' } }],
      version: 2,
      createdAt: '2026-10-14T07:00:00.000Z',
      updatedAt: '2026-10-14T07:05:00.000Z',
      lines: [
        {
          id: ID,
          employeeId: ID,
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
        },
      ],
      totals: {
        employees: 1,
        proposed: 1,
        increaseByCurrency: [{ currency: 'AED', amount: '1720.00' }],
        averagePercent: '8.0',
      },
    };
    expect(IncrementRequestSchema.parse(response)).toEqual(response);
  });
});
