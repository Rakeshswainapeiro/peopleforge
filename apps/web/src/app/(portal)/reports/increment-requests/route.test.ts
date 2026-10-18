import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { downloadIncrementReport } from '@/server/increment-requests';
import { GET } from './route';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/increment-requests', () => ({ downloadIncrementReport: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const CYCLE = '00000000-0000-4000-8000-00000000c026';
const get = (query: string) =>
  GET(new Request(`http://web.test/reports/increment-requests?${query}`));

beforeEach(() => {
  vi.mocked(downloadIncrementReport).mockReset();
  vi.mocked(getRequestLocale).mockResolvedValue('ar');
});

describe('RP-01 download route [R1-14]', () => {
  it('asks the API for the file in the reader’s language and streams it as an attachment', async () => {
    vi.mocked(downloadIncrementReport).mockResolvedValue({
      kind: 'ok',
      response: new Response('PK', {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': 'attachment; filename="PeopleForge-RP-01-2026-10-18.xlsx"',
        },
      }),
    });
    const res = await get(`format=xlsx&cycle=${CYCLE}&status=approved&q=Aisha&entity=bad`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('PeopleForge-RP-01-');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(downloadIncrementReport).toHaveBeenCalledWith({
      format: 'xlsx',
      locale: 'ar',
      cycleId: CYCLE,
      entityId: undefined,
      status: 'approved',
      search: 'Aisha',
    });
  });

  it('refuses an unknown format without calling the API, and maps API refusals', async () => {
    expect((await get('format=csv')).status).toBe(400);
    expect(downloadIncrementReport).not.toHaveBeenCalled();
    vi.mocked(downloadIncrementReport).mockResolvedValue({ kind: 'not_found' });
    expect((await get('format=pdf&cycle=all')).status).toBe(404);
    vi.mocked(downloadIncrementReport).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(get('format=pdf')).rejects.toThrow('NEXT_REDIRECT /session-ended');
  });
});
