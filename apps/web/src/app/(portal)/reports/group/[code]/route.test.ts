import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { downloadGroupReport } from '@/server/group-data';
import { GET } from './route';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/group-data', () => ({ downloadGroupReport: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const SUB_A = '00000000-0000-4000-8000-0000000e000a';
const get = (code: string, query: string) =>
  GET(new Request(`http://web.test/reports/group/${code}?${query}`), {
    params: Promise.resolve({ code }),
  });

beforeEach(() => {
  vi.mocked(downloadGroupReport).mockReset();
  vi.mocked(getRequestLocale).mockResolvedValue('ar');
});

describe('group report download route [R2-06, R2-07]', () => {
  it('asks the API for the report in the reader’s language and streams it as an attachment', async () => {
    vi.mocked(downloadGroupReport).mockResolvedValue({
      kind: 'ok',
      response: new Response('%PDF-', {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="PeopleForge-RP-03-2026-09-2026-10-21.pdf"',
        },
      }),
    });
    const res = await get('rp-03', `period=2026-09&entity=${SUB_A}&format=pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('PeopleForge-RP-03-');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(downloadGroupReport).toHaveBeenCalledWith({
      code: 'rp-03',
      period: '2026-09',
      format: 'pdf',
      entityId: SUB_A,
      locale: 'ar',
    });
  });

  it('refuses what the report does not take without calling the API, and maps refusals', async () => {
    expect((await get('rp-06', 'period=2026-Q3&format=xlsx')).status).toBe(400);
    expect((await get('rp-99', 'period=2026-09&format=pdf')).status).toBe(400);
    expect(downloadGroupReport).not.toHaveBeenCalled();
    vi.mocked(downloadGroupReport).mockResolvedValue({ kind: 'not_found' });
    expect((await get('rp-07', 'period=2025&format=pdf')).status).toBe(404);
    vi.mocked(downloadGroupReport).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(get('rp-07', 'period=2025&format=pdf')).rejects.toThrow(
      'NEXT_REDIRECT /session-ended',
    );
  });
});
