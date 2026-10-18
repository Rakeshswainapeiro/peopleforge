import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { downloadTatReport } from '@/server/analytics';
import { GET } from './route';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/analytics', () => ({ downloadTatReport: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const CYCLE = '00000000-0000-4000-8000-00000000c026';

beforeEach(() => {
  vi.mocked(getRequestLocale).mockResolvedValue('en');
});

describe('RP-02 download route [R1-14]', () => {
  it('streams the workbook for the filters in the reader’s language', async () => {
    vi.mocked(downloadTatReport).mockResolvedValue({
      kind: 'ok',
      response: new Response('PK', {
        headers: { 'content-disposition': 'attachment; filename="PeopleForge-RP-02.xlsx"' },
      }),
    });
    const res = await GET(new Request(`http://web.test/analytics/rp-02?cycle=${CYCLE}&entity=x`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('RP-02');
    expect(downloadTatReport).toHaveBeenCalledWith({ cycleId: CYCLE }, 'en');
  });

  it('answers 404 when the API refuses (a subsidiary)', async () => {
    vi.mocked(downloadTatReport).mockResolvedValue({ kind: 'not_found' });
    expect((await GET(new Request('http://web.test/analytics/rp-02'))).status).toBe(404);
  });
});
