import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { employeeBadge, statusBadge } from './request-status';

const t = createTranslator('en');

describe('statusBadge [R1-06]', () => {
  it.each([
    ['draft', 'outline', 'Draft'],
    ['submitted', 'neutral', 'Submitted'],
    ['under_review', 'info', 'Under review'],
    ['returned', 'warning', 'Returned'],
    ['approved', 'brand', 'Approved'],
    ['partly_approved', 'info-outline', 'Partly approved'],
    ['rejected', 'danger-solid', 'Rejected'],
  ] as const)('shows %s as a %s pill reading %s', (status, tone, label) => {
    expect(statusBadge(status, t)).toEqual({ tone, label });
  });
});

describe('employeeBadge [R1-09]', () => {
  it('shares a draft’s status, then shows the employee’s own', () => {
    expect(employeeBadge('draft', 'pending', false, t)).toEqual({
      tone: 'outline',
      label: 'Draft',
    });
    expect(employeeBadge('under_review', 'pending', false, t).label).toBe('With Sirius HR');
    expect(employeeBadge('under_review', 'pending', true, t).label).toBe('To review');
    expect(employeeBadge('partly_approved', 'approved', true, t)).toEqual({
      tone: 'brand',
      label: 'Approved',
    });
    expect(employeeBadge('partly_approved', 'rejected', false, t).tone).toBe('danger-solid');
    expect(employeeBadge('returned', 'returned', false, t)).toEqual({
      tone: 'warning',
      label: 'Returned',
    });
  });
});
