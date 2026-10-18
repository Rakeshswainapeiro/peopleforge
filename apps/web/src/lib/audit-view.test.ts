import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { auditEvent } from '@/test-support/requests';
import { actionName, auditHref, auditRows, auditState, detailText } from './audit-view';

const t = createTranslator('en');

describe('audit views [R1-15, NFR-AUD-01]', () => {
  it('reads the URL, dropping anything malformed', () => {
    expect(
      auditState({
        q: ' Priya ',
        actor: ['oid-4'],
        from: '2026-10-01',
        to: '2026-10-31',
        page: '3',
      }),
    ).toEqual({ search: 'Priya', actor: 'oid-4', from: '2026-10-01', to: '2026-10-31', page: 3 });
    expect(auditState({ q: '', actor: 'x'.repeat(200), from: '01/10/2026', page: '0' })).toEqual({
      search: undefined,
      actor: undefined,
      from: undefined,
      to: undefined,
      page: 1,
    });
  });

  it('links to the page, back to page 1 when a filter changes', () => {
    const state = { search: 'a&b', actor: 'oid-4', from: '2026-10-01', to: '2026-10-31', page: 2 };
    expect(auditHref({ page: 1 })).toBe('/audit');
    expect(auditHref(state, { page: 3 })).toBe(
      '/audit?q=a%26b&actor=oid-4&from=2026-10-01&to=2026-10-31&page=3',
    );
    expect(auditHref(state, { actor: undefined })).toBe(
      '/audit?q=a%26b&from=2026-10-01&to=2026-10-31',
    );
  });

  it('names actions, lists details in order, and builds rows', () => {
    expect(actionName('request_line.returned', t)).toBe('Employee returned');
    expect(actionName('legacy.thing', t)).toBe('legacy.thing');
    expect(detailText({ to: 'submitted', from: 'draft', note: null, rows: 3, search: false })).toBe(
      'from: draft · rows: 3 · search: false · to: submitted',
    );
    const rows = auditRows(
      {
        items: [auditEvent(), auditEvent({ id: '2', actorName: null, actor: 'oid-9' })],
        page: 1,
        pageSize: 25,
        total: 2,
      },
      { page: 2 },
      'en',
      t,
    );
    expect(rows[0]).toEqual({
      id: '9001',
      when: '15 Oct 2026, 11:14',
      who: 'Priya Nair',
      actor: 'oid-4',
      action: 'Request submitted',
      subject: 'increment_request · 11111111-1111-4111-8111-111111111111',
      details: 'from: draft · reference: INC-2026-0152 · to: submitted',
      onlyHref: '/audit?actor=oid-4',
    });
    expect(rows[1]).toMatchObject({ who: 'Unknown user', onlyHref: '/audit?actor=oid-9' });
  });
});
