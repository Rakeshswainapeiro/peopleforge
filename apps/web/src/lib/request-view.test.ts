import type { IncrementRequest } from '@peopleforge/contracts';
import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import {
  employeesAdded,
  proposalRows,
  saveMessages,
  tableLabels,
  totalsView,
} from './request-view';

const t = createTranslator('en');
const ID = '00000000-0000-4000-8000-0000000e000a';

function request(overrides: Partial<IncrementRequest> = {}): IncrementRequest {
  return {
    id: ID,
    reference: 'INC-2026-0001',
    status: 'draft',
    entity: { id: ID, code: 'SUB-C', name: { en: 'Subsidiary C' } },
    cycle: { id: ID, name: { en: 'Increment cycle 2026' } },
    version: 2,
    createdAt: '2026-10-14T07:00:00.000Z',
    updatedAt: '2026-10-14T07:00:00.000Z',
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
      {
        id: ID,
        employeeId: ID,
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
      },
    ],
    totals: {
      employees: 2,
      proposed: 1,
      increaseByCurrency: [
        { currency: 'AED', amount: '1720.00' },
        { currency: 'USD', amount: '250.50' },
      ],
      averagePercent: '6.6',
    },
    ...overrides,
  };
}

describe('proposalRows', () => {
  it('formats amounts and labels each row for screen readers', () => {
    const [first, second] = proposalRows(request(), 'en', t);
    expect(first?.current).toMatch(/^AED\s21,500$/u);
    expect(first?.newSalary).toMatch(/^AED\s23,220$/u);
    expect(first).toMatchObject({
      kind: 'percent',
      value: '8',
      currencyCode: 'AED',
      labels: {
        proposedAs: 'Proposed as, for Omar Haddad',
        value: 'Proposed increase for Omar Haddad',
        remove: 'Remove Omar Haddad',
      },
    });
    expect(second).toMatchObject({ newSalary: 'Not set', kind: 'percent', value: '' });
  });
});

describe('totalsView', () => {
  it('shows totals per currency and the average', () => {
    const totals = totalsView(request(), 'en', t);
    expect(totals.employees).toBe('2');
    expect(totals.increase).toMatch(/^AED\s1,720 \/ month \+ USD\s250\.50 \/ month$/u);
    expect(totals.average).toBe('6.6%');
  });

  it('says "Not set" before any proposal', () => {
    const empty = request({
      totals: { employees: 0, proposed: 0, increaseByCurrency: [], averagePercent: null },
    });
    expect(totalsView(empty, 'en', t)).toEqual({
      employees: '0',
      increase: 'Not set',
      average: 'Not set',
    });
  });
});

describe('labels and messages', () => {
  it('translates table labels and every save message', () => {
    expect(tableLabels(t)).toMatchObject({ colCurrent: 'Current monthly', save: 'Save draft' });
    const messages = new Map(saveMessages(t));
    expect(messages.get('request.errors.overLimit')).toMatch(/at most 100%/u);
    expect(messages.get('request.errors.stale')).toMatch(/another window/u);
  });

  it('pluralises "employees added"', () => {
    expect(employeesAdded(1, 'en', t)).toBe('1 employee added');
    expect(employeesAdded(4, 'en', t)).toBe('4 employees added');
  });
});
