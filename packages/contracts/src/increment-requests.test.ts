import { describe, expect, it } from 'vitest';
import {
  CreateIncrementRequestSchema,
  DecimalString,
  EmployeeSearchQuerySchema,
  IncrementRequestSchema,
  ListIncrementRequestsQuerySchema,
  EvidenceUploadSchema,
  MAX_JUSTIFICATION_LENGTH,
  SaveDraftSchema,
  SubmitRequestSchema,
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

describe('SaveDraftSchema', () => {
  it('takes a kind and a value together, or neither', () => {
    const parse = (kind: unknown, value: unknown) =>
      SaveDraftSchema.safeParse({ version: 1, proposals: [{ lineId: ID, kind, value }] }).success;
    expect(parse('percent', '8')).toBe(true);
    expect(parse(null, null)).toBe(true);
    expect(parse('amount', null)).toBe(false);
    expect(parse(null, '8')).toBe(false);
    expect(parse('bonus', '8')).toBe(false);
  });

  it('requires a positive whole version', () => {
    expect(SaveDraftSchema.safeParse({ version: 0, proposals: [] }).success).toBe(false);
    expect(SaveDraftSchema.safeParse({ version: 1.5, proposals: [] }).success).toBe(false);
  });

  const OTHER = '00000000-0000-4000-8000-0000000e000b';
  const withResults = (results: unknown) =>
    SaveDraftSchema.safeParse({ version: 1, proposals: [], assessment: { lineId: ID, results } });

  it('takes one employee’s criteria, normalising justifications to NFC [R1-03]', () => {
    const parsed = SaveDraftSchema.parse({
      version: 1,
      proposals: [],
      assessment: {
        lineId: ID,
        results: [
          { criterionId: ID, result: 'pass', justification: 'cafe\u0301' },
          { criterionId: OTHER, result: null, justification: '' },
        ],
      },
    });
    expect(parsed.assessment?.results.map((r) => r.justification)).toEqual(['café', '']);
    expect(SaveDraftSchema.parse({ version: 1, proposals: [] }).assessment).toBeUndefined();
  });

  it('bounds justifications and refuses unknown results or duplicate criteria', () => {
    const text = (length: number) => [
      { criterionId: ID, result: 'fail', justification: 'ج'.repeat(length) },
    ];
    expect(withResults(text(MAX_JUSTIFICATION_LENGTH)).success).toBe(true);
    expect(withResults(text(MAX_JUSTIFICATION_LENGTH + 1)).success).toBe(false);
    expect(withResults([{ criterionId: ID, result: 'maybe', justification: '' }]).success).toBe(
      false,
    );
    const twice = { criterionId: ID, result: null, justification: '' };
    expect(withResults([twice, twice]).success).toBe(false);
    expect(
      withResults([{ criterionId: ID, result: null, justification: '', extra: 1 }]).success,
    ).toBe(false);
  });
});

describe('SubmitRequestSchema', () => {
  it('needs the version the user saw, nothing else', () => {
    expect(SubmitRequestSchema.parse({ version: 4 })).toEqual({ version: 4 });
    expect(SubmitRequestSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(SubmitRequestSchema.safeParse({ version: 4, status: 'approved' }).success).toBe(false);
  });
});

describe('EvidenceUploadSchema', () => {
  it('needs the employee line and criterion, nothing else', () => {
    expect(EvidenceUploadSchema.parse({ lineId: ID, criterionId: ID })).toEqual({
      lineId: ID,
      criterionId: ID,
    });
    expect(EvidenceUploadSchema.safeParse({ lineId: ID }).success).toBe(false);
    expect(
      EvidenceUploadSchema.safeParse({ lineId: ID, criterionId: ID, entityId: ID }).success,
    ).toBe(false);
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
      cycle: { id: ID, name: { en: 'Increment cycle 2026' }, submissionDeadline: '2026-11-30' },
      criteria: [
        {
          id: ID,
          code: 'C1',
          name: { en: '[Placeholder] Performance rating' },
          description: { en: 'Latest appraisal meets the minimum rating.' },
          justificationRequired: true,
          evidencePolicy: 'required',
          allowedMediaTypes: ['application/pdf'],
          maxFileMb: 10,
        },
      ],
      version: 2,
      createdAt: '2026-10-14T07:00:00.000Z',
      updatedAt: '2026-10-14T07:05:00.000Z',
      submittedAt: null,
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
          criteria: [
            {
              criterionId: ID,
              result: 'pass',
              justification: 'Rated 4 of 5.',
              evidence: [
                {
                  id: ID,
                  fileName: 'appraisal.pdf',
                  mediaType: 'application/pdf',
                  sizeBytes: 2048,
                  createdAt: '2026-10-14T07:01:00.000Z',
                },
              ],
              missing: [],
            },
          ],
        },
      ],
      totals: {
        employees: 1,
        proposed: 1,
        ready: 1,
        increaseByCurrency: [{ currency: 'AED', amount: '1720.00' }],
        averagePercent: '8.0',
      },
    };
    expect(IncrementRequestSchema.parse(response)).toEqual(response);
  });
});
