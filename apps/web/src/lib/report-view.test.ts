import { describe, expect, it } from 'vitest';
import { canReadIncrementReport, reportHref, reportQuery } from './report-view';

const CYCLE = '00000000-0000-4000-8000-00000000c026';
const ENTITY = '00000000-0000-4000-8000-0000000e000a';

describe('report views [R1-14]', () => {
  it('needs request and compensation access for RP-01 (not the report permission alone)', () => {
    expect(
      canReadIncrementReport([
        'increment_request:read',
        'employee_data:read_compensation',
        'report:read_operational',
      ]),
    ).toBe(true);
    expect(canReadIncrementReport(['report:read_operational', 'audit:read'])).toBe(false);
    expect(canReadIncrementReport(['increment_request:read'])).toBe(false);
  });

  it('carries the filters into the download link and back, period resolved', () => {
    const href = reportHref(
      { cycleId: CYCLE, entityId: ENTITY, status: 'approved', search: 'Aisha & co' },
      'xlsx',
    );
    expect(href).toBe(
      `/reports/increment-requests?format=xlsx&cycle=${CYCLE}&entity=${ENTITY}&status=approved&q=Aisha+%26+co`,
    );
    const params = Object.fromEntries(new URL(href, 'http://portal.test').searchParams);
    expect(reportQuery(params)).toEqual({
      format: 'xlsx',
      filter: { cycleId: CYCLE, entityId: ENTITY, status: 'approved', search: 'Aisha & co' },
    });
    expect(reportHref({}, 'pdf')).toBe('/reports/increment-requests?format=pdf&cycle=all');
    expect(reportQuery({ format: 'pdf', cycle: 'all' })).toEqual({
      format: 'pdf',
      filter: { cycleId: undefined, entityId: undefined, status: undefined, search: undefined },
    });
  });

  it('refuses an unknown format', () => {
    expect(reportQuery({ format: 'csv' })).toBeNull();
    expect(reportQuery({})).toBeNull();
  });
});
