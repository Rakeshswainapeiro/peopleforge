import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import {
  downloadExtract,
  downloadTemplate,
  downloadUploadFile,
  downloadUploadIssues,
} from '@/server/group-data';
import { SUB_A, UPLOAD_ID } from '@/test-support/group';
import { GET as extract } from './extract/download/route';
import { GET as template } from './template/route';
import { GET as file } from './uploads/[id]/file/route';
import { GET as issues } from './uploads/[id]/issues/route';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/group-data', () => ({
  downloadExtract: vi.fn(),
  downloadTemplate: vi.fn(),
  downloadUploadFile: vi.fn(),
  downloadUploadIssues: vi.fn(),
}));

// The group data downloads (R2-01, R2-08): the API decides access and records downloads; the
// routes stream the answer as an attachment, in the reader's language.

const ok = () => ({ kind: 'ok' as const, response: new Response('x') });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.mocked(getRequestLocale).mockResolvedValue('ar');
  for (const download of [
    downloadExtract,
    downloadTemplate,
    downloadUploadFile,
    downloadUploadIssues,
  ]) {
    vi.mocked(download).mockResolvedValue(ok());
  }
});

describe('group data download routes', () => {
  it('serves the template in the reader language', async () => {
    expect((await template()).status).toBe(200);
    expect(downloadTemplate).toHaveBeenCalledWith('ar');
  });

  it('serves an upload problem report and its original file, 404 for a bad ID', async () => {
    expect((await issues(new Request('http://web.test/x'), params(UPLOAD_ID))).status).toBe(200);
    expect(downloadUploadIssues).toHaveBeenCalledWith(UPLOAD_ID, 'ar');
    expect((await file(new Request('http://web.test/x'), params(UPLOAD_ID))).status).toBe(200);
    expect(downloadUploadFile).toHaveBeenCalledWith(UPLOAD_ID);
    expect((await issues(new Request('http://web.test/x'), params('../x'))).status).toBe(404);
    expect((await file(new Request('http://web.test/x'), params('x'))).status).toBe(404);
    vi.mocked(downloadUploadFile).mockResolvedValueOnce({ kind: 'not_found' });
    expect((await file(new Request('http://web.test/x'), params(UPLOAD_ID))).status).toBe(404);
  });

  it('extracts with the chosen month, subsidiary, versions and format', async () => {
    const res = await extract(
      new Request(
        `http://web.test/group/extract/download?format=palmhr&period=2026-08&entity=${SUB_A}&allVersions=true`,
      ),
    );
    expect(res.status).toBe(200);
    expect(downloadExtract).toHaveBeenCalledWith({
      format: 'palmhr',
      period: '2026-08',
      entityId: SUB_A,
      allVersions: true,
      locale: 'ar',
    });
  });
});
