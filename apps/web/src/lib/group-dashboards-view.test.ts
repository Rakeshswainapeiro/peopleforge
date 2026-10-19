import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { SUB_A } from '@/test-support/group';
import {
  ageBandKey,
  bucketKey,
  compact,
  dashboardState,
  movement,
  plainPercent,
  shortMonth,
  signedPercent,
} from './group-dashboards-view';

const t = createTranslator('en');

describe('group dashboards view [DASH-D5, D6, D8]', () => {
  it('defaults to last month and keeps valid filters', () => {
    const now = new Date('2026-10-19T08:00:00Z');
    expect(dashboardState({}, now)).toEqual({
      period: '2026-09',
      entity: undefined,
      department: undefined,
    });
    expect(
      dashboardState({ period: '2026-07', entity: SUB_A, department: ' Finance ' }, now),
    ).toEqual({ period: '2026-07', entity: SUB_A, department: 'Finance' });
    expect(dashboardState({ period: ['2026-05', '2026-06'] }, now).period).toBe('2026-05');
    expect(dashboardState({ period: 'x', entity: 'y', department: '' }, now)).toEqual({
      period: '2026-09',
      entity: undefined,
      department: undefined,
    });
  });

  it('formats percentages, months and compact amounts from decimal strings', () => {
    expect(signedPercent('2.7', 'en')).toBe('+2.7%');
    expect(signedPercent('-1.5', 'en')).toBe('-1.5%');
    expect(signedPercent('0.0', 'en')).toBe('0%');
    expect(signedPercent(null, 'en')).toBe('—');
    expect(plainPercent('47.4', 'en')).toBe('47.4%');
    expect(plainPercent(null, 'en')).toBe('—');
    expect(shortMonth('2026-09', 'en')).toBe('Sept 26');
    expect(shortMonth('2026-09', 'ar')).toBe(
      new Intl.DateTimeFormat('ar', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
        new Date('2026-09-01T00:00:00Z'),
      ),
    );
    expect(compact('189000.00', 'en')).toBe('189K');
  });

  it('shows joiners and leavers with signs, zero without', () => {
    expect(movement(2, 1, 'en')).toBe('+2 / −1');
    expect(movement(0, 0, 'en')).toBe('0 / 0');
    expect(movement(1200, 0, 'en')).toBe('+1,200 / 0');
  });

  it('names age bands and increment sizes', () => {
    expect(t(ageBandKey('25_34'))).toBe('25–34');
    expect(t(bucketKey('10_plus'))).toBe('10%+');
  });
});
