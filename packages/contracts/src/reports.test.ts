import { describe, expect, it } from 'vitest';
import {
  AuditEventSchema,
  AuditTrailPageSchema,
  AuditTrailQuerySchema,
  IncrementReportQuerySchema,
} from './reports.js';

const ID = '00000000-0000-4000-8000-0000000e000a';

describe('report and audit contracts [R1-14, R1-15]', () => {
  it('takes a format, the dashboard filters and a locale', () => {
    expect(IncrementReportQuerySchema.parse({ format: 'xlsx' })).toEqual({
      format: 'xlsx',
      locale: 'en',
    });
    expect(
      IncrementReportQuerySchema.parse({
        format: 'pdf',
        entityId: ID,
        status: 'approved',
        locale: 'ar',
      }),
    ).toMatchObject({ format: 'pdf', entityId: ID, locale: 'ar' });
    expect(IncrementReportQuerySchema.safeParse({ format: 'csv' }).success).toBe(false);
    expect(IncrementReportQuerySchema.safeParse({ format: 'xlsx', locale: 'fr' }).success).toBe(
      false,
    );
  });

  it('pages the trail with optional user, search and dates', () => {
    expect(AuditTrailQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(
      AuditTrailQuerySchema.parse({
        actor: ' oid-1 ',
        search: ' ',
        from: '2026-10-01',
        to: '2026-10-31',
      }),
    ).toEqual({
      actor: 'oid-1',
      search: undefined,
      from: '2026-10-01',
      to: '2026-10-31',
      page: 1,
      pageSize: 25,
    });
    expect(AuditTrailQuerySchema.safeParse({ from: '01/10/2026' }).success).toBe(false);
    expect(AuditTrailQuerySchema.parse({ pageSize: '50' }).pageSize).toBe(50);
    expect(AuditTrailQuerySchema.safeParse({ pageSize: '7' }).success).toBe(false);
  });

  it('documents an entry and a page', () => {
    const event = {
      id: '42',
      at: '2026-10-17T08:00:00.000Z',
      actor: 'oid-1',
      actorName: 'Sara',
      action: 'request_line.approved',
      entityId: ID,
      subjectType: 'request_line',
      subjectId: ID,
      details: { requestId: ID, changedIncrement: true, rows: 3, reasonCode: null },
    };
    expect(AuditEventSchema.parse(event)).toEqual(event);
    expect(
      AuditEventSchema.safeParse({ ...event, details: { nested: { no: true } } }).success,
    ).toBe(false);
    expect(
      AuditTrailPageSchema.safeParse({ items: [event], page: 1, pageSize: 25, total: 1 }).success,
    ).toBe(true);
  });
});
