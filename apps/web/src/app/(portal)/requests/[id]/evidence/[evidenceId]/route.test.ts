import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadEvidence } from '@/server/increment-requests';
import { GET } from './route';

vi.mock('@/server/increment-requests', () => ({ downloadEvidence: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const ID = '11111111-1111-4111-8111-111111111111';
const EVIDENCE = '55555555-5555-4555-8555-555555555551';
const get = (id = ID, evidenceId = EVIDENCE) =>
  GET(new Request('http://web.test/x'), { params: Promise.resolve({ id, evidenceId }) });

beforeEach(() => {
  vi.mocked(downloadEvidence).mockReset();
});

describe('evidence download route [R1-04, ADR-010]', () => {
  it('streams the file as a sandboxed, uncached attachment, passing only safe headers', async () => {
    vi.mocked(downloadEvidence).mockResolvedValue({
      kind: 'ok',
      response: new Response('%PDF-1.7', {
        headers: {
          'content-type': 'application/pdf',
          'content-length': '8',
          'content-disposition': 'attachment; filename="a.pdf"',
          'set-cookie': 'api=1',
          'x-request-id': 'abc',
        },
      }),
    });
    const res = await get();
    expect(res.status).toBe(200);
    expect(Object.fromEntries(res.headers)).toEqual({
      'cache-control': 'private, no-store',
      'content-disposition': 'attachment; filename="a.pdf"',
      'content-length': '8',
      'content-security-policy': "default-src 'none'; sandbox",
      'content-type': 'application/pdf',
      'x-content-type-options': 'nosniff',
    });
    await expect(res.text()).resolves.toBe('%PDF-1.7');
    expect(downloadEvidence).toHaveBeenCalledWith(ID, EVIDENCE);
  });

  it('tolerates a response without optional headers', async () => {
    vi.mocked(downloadEvidence).mockResolvedValue({ kind: 'ok', response: new Response('x') });
    const res = await get();
    expect(res.headers.get('content-disposition')).toBeNull();
  });

  it('answers 404 for malformed IDs without calling the API', async () => {
    expect((await get('../me')).status).toBe(404);
    expect((await get(ID, 'x')).status).toBe(404);
    expect(downloadEvidence).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 404],
    ['unavailable', 503],
  ] as const)('answers %s with %i', async (kind, status) => {
    vi.mocked(downloadEvidence).mockResolvedValue({ kind });
    const res = await get();
    expect(res.status).toBe(status);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('ends a session the API no longer accepts', async () => {
    vi.mocked(downloadEvidence).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(get()).rejects.toThrow('NEXT_REDIRECT /session-ended');
  });
});
