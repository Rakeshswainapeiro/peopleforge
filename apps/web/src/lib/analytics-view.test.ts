import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { incrementAnalytics } from '@/test-support/requests';
import {
  analyticsHref,
  analyticsState,
  criterionOptions,
  daysText,
  flowCards,
  flowTables,
  rp02Href,
  rp02Query,
  tatCards,
  tatTables,
  trendPoints,
} from './analytics-view';

const t = createTranslator('en');
const CYCLE = '00000000-0000-4000-8000-00000000c026';
const ENTITY = '00000000-0000-4000-8000-0000000e000a';

describe('analytics views [R1-11, R1-12]', () => {
  it('keeps the view and filters in the URL', () => {
    expect(analyticsState({ view: 'flow', cycle: 'all', entity: ENTITY })).toEqual({
      view: 'flow',
      cycle: 'all',
      entity: ENTITY,
      criterion: undefined,
    });
    expect(analyticsState({ view: 'other', entity: 'x', criterion: 'C1; DROP' })).toEqual({
      view: 'tat',
      cycle: undefined,
      entity: undefined,
      criterion: undefined,
    });
    expect(analyticsState({ criterion: ['C3', 'C4'] }).criterion).toBe('C3');
    expect(analyticsHref({ view: 'tat', criterion: 'C2' })).toBe('/analytics?criterion=C2');
    expect(analyticsHref({ view: 'tat' })).toBe('/analytics');
    expect(analyticsHref({ view: 'tat', cycle: CYCLE, entity: ENTITY }, { view: 'flow' })).toBe(
      `/analytics?view=flow&cycle=${CYCLE}&entity=${ENTITY}`,
    );
  });

  it('carries the filters into RP-02 and reads them back, dropping anything malformed', () => {
    expect(rp02Href({})).toBe('/analytics/rp-02?cycle=all');
    const href = rp02Href({ cycleId: CYCLE, entityId: ENTITY });
    expect(href).toBe(`/analytics/rp-02?cycle=${CYCLE}&entity=${ENTITY}`);
    expect(rp02Query(Object.fromEntries(new URL(href, 'http://x.test').searchParams))).toEqual({
      cycleId: CYCLE,
      entityId: ENTITY,
    });
    expect(rp02Query({ cycle: 'all', entity: '../x', criterion: 'x' })).toEqual({});
    expect(rp02Href({ criterion: 'C2' })).toBe('/analytics/rp-02?cycle=all&criterion=C2');
    expect(rp02Query({ criterion: 'C2' })).toEqual({ criterion: 'C2' });
  });

  it('words days in the reader’s digits', () => {
    expect(daysText('2.5', 'en', t)).toBe('2.5 days');
    expect(daysText('3.0', 'en', t)).toBe('3.0 days');
    expect(daysText(null, 'en', t)).toBe('—');
  });

  it('builds the TAT cards and tables', () => {
    const data = incrementAnalytics();
    expect(tatCards(data, 'en', t)).toEqual([
      { label: 'Average TAT', value: '4.5 days', hint: 'Median 4.5 days · 1 decided' },
      { label: 'Open requests', value: '1', hint: 'Average age: 2.5 days' },
      { label: 'Longest open', value: '2.5 days', hint: 'INC-2026-0152 · SUB-A' },
    ]);
    const quiet = incrementAnalytics();
    quiet.tat.longestOpen = null;
    expect(tatCards(quiet, 'en', t)[2]).toEqual({
      label: 'Longest open',
      value: '—',
      hint: 'Nothing open',
    });
    const tables = tatTables(data, 'en', t);
    expect(tables.criteria.rows[0]).toEqual({
      id: 'C1',
      cells: ['C1', '3', '0.8 days', '0.5 days', '1.0 days'],
    });
    expect(tables.entities.rows[0]?.cells).toEqual(['SUB-A', '2', '1', '4.5 days', '2.5 days']);
    expect(tables.requests.rows.map((row) => row.cells)).toEqual([
      ['INC-2026-0150', 'SUB-A', 'Approved', '15 Oct 2026', '4.5 days'],
      ['INC-2026-0152', 'SUB-A', 'Returned', '15 Oct 2026', '2.5 days · Open'],
    ]);
  });

  it('charts the trend with gaps, and offers each criterion [DASH-D3]', () => {
    const data = incrementAnalytics();
    expect(trendPoints(data, 'en', t)).toEqual([
      { id: '2026-09', label: 'Sept 26', value: null, display: '—' },
      { id: '2026-10', label: 'Oct 26', value: 4.5, display: '4.5 days' },
    ]);
    expect(criterionOptions(data, t)).toEqual([
      { value: '', label: 'All criteria' },
      { value: 'C1', label: 'C1' },
      { value: 'C2', label: 'C2' },
    ]);
  });

  it('builds the back-and-forth cards and tables', () => {
    const data = incrementAnalytics();
    expect(flowCards(data, 'en', t).map((card) => [card.label, card.value])).toEqual([
      ['Employees returned', '1'],
      ['Average return', '1.0 days'],
      ['Questions asked', '2'],
      ['Average answer', '—'],
    ]);
    const tables = flowTables(data, 'en', t);
    expect(tables.entities.rows[0]?.cells).toEqual(['SUB-A', '2', '1', '1.0 days', '2', '—']);
    expect(tables.requests.rows[0]?.cells).toEqual([
      'INC-2026-0152',
      'SUB-A',
      'Returned',
      '1',
      '1',
      '1.0 days',
      '2',
      '0',
      '—',
    ]);
  });
});
