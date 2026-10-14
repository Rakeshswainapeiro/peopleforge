import type { NestExpressApplication } from '@nestjs/platform-express';
import { EvidenceFileSchema, MAX_EVIDENCE_FILE_MB } from '@peopleforge/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../../auth/principal.js';
import { anonymous, buildApp, errorOf, resolveAs, SUB_A } from '../../test-support/factory.js';
import {
  alphaHr,
  CRITERION_IDS,
  EVIDENCE_ID,
  executive,
  LINE_2,
  memoryObjectStore,
  REQUEST_ID,
  reviewer,
  SAMPLE_PDF,
  stubScanner,
  workingRepository,
  type MemoryObjectStore,
} from '../../test-support/increment-requests.js';

const base = `/api/v1/increment-requests/${REQUEST_ID}/evidence`;
const C2 = String(CRITERION_IDS[1]);

async function app(
  caller: Principal | null,
  store: MemoryObjectStore = memoryObjectStore(),
): Promise<NestExpressApplication> {
  return buildApp({
    resolvePrincipal: caller === null ? anonymous : resolveAs(caller),
    incrementRequests: workingRepository(),
    objectStore: store,
    malwareScanner: stubScanner(),
  });
}

describe('evidence routes [R1-04, NFR-SEC-01]', () => {
  it.each([
    ['POST', base],
    ['GET', `${base}/${EVIDENCE_ID}`],
    ['DELETE', `${base}/${EVIDENCE_ID}`],
  ])('refuses %s %s without a session (401)', async (method, path) => {
    const server = (await app(null)).getHttpServer();
    const res = await request(server)[method.toLowerCase() as 'get'](path).expect(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  it.each([
    [executive, 'POST', base],
    [executive, 'GET', `${base}/${EVIDENCE_ID}`],
    [executive, 'DELETE', `${base}/${EVIDENCE_ID}`],
    [reviewer, 'POST', base],
    [reviewer, 'DELETE', `${base}/${EVIDENCE_ID}`],
  ])(
    'refuses %# without the permission (403), before reading any file',
    async (caller, method, path) => {
      const store = memoryObjectStore();
      const server = (await app(caller, store)).getHttpServer();
      const call = request(server)[method.toLowerCase() as 'post'](path);
      const res = await (
        method === 'POST'
          ? call
              .field('lineId', LINE_2)
              .field('criterionId', C2)
              .attach('file', SAMPLE_PDF, 'a.pdf')
          : call
      ).expect(403);
      expect(errorOf(res).code).toBe('FORBIDDEN');
      expect(store.put).not.toHaveBeenCalled();
    },
  );

  it('uploads a file as multipart form data, keeping a UTF-8 file name', async () => {
    const store = memoryObjectStore();
    const server = (await app(alphaHr, store)).getHttpServer();
    const res = await request(server)
      .post(base)
      .field('lineId', LINE_2)
      .field('criterionId', C2)
      .attach('file', SAMPLE_PDF, { filename: 'تقييم الأداء.pdf', contentType: 'text/plain' })
      .expect(201);
    const saved = EvidenceFileSchema.parse(res.body);
    // The browser's claimed type is ignored: the content decides.
    expect(saved).toMatchObject({ fileName: 'تقييم الأداء.pdf', mediaType: 'application/pdf' });
    expect([...store.objects.keys()]).toEqual([`evidence/${SUB_A}/${saved.id}`]);
  });

  it('refuses missing or extra fields', async () => {
    const server = (await app(alphaHr)).getHttpServer();
    const missing = await request(server)
      .post(base)
      .field('lineId', LINE_2)
      .attach('file', SAMPLE_PDF, 'a.pdf')
      .expect(400);
    expect(errorOf(missing).details?.[0]?.path).toBe('criterionId');
    await request(server)
      .post(base)
      .field('lineId', LINE_2)
      .field('criterionId', C2)
      .field('entityId', SUB_A)
      .attach('file', SAMPLE_PDF, 'a.pdf')
      .expect(400);
  });

  it('refuses a second file and a file over the limit', async () => {
    const server = (await app(alphaHr)).getHttpServer();
    await request(server)
      .post(base)
      .field('lineId', LINE_2)
      .field('criterionId', C2)
      .attach('file', SAMPLE_PDF, 'a.pdf')
      .attach('file', SAMPLE_PDF, 'b.pdf')
      .expect(400);
    const big = Buffer.concat([SAMPLE_PDF, Buffer.alloc(MAX_EVIDENCE_FILE_MB * 1024 * 1024)]);
    const res = await request(server)
      .post(base)
      .field('lineId', LINE_2)
      .field('criterionId', C2)
      .attach('file', big, 'big.pdf')
      .expect(413);
    expect(errorOf(res).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('downloads as an attachment that is never cached or sniffed', async () => {
    const store = memoryObjectStore();
    store.objects.set(`evidence/${SUB_A}/${EVIDENCE_ID}`, SAMPLE_PDF);
    const server = (await app(alphaHr, store)).getHttpServer();
    const res = await request(server)
      .get(`${base}/${EVIDENCE_ID}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          callback(null, Buffer.concat(chunks));
        });
      })
      .expect(200);
    expect(res.headers).toMatchObject({
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="appraisal-2026.pdf"; filename*=UTF-8''appraisal-2026.pdf`,
      'content-length': String(SAMPLE_PDF.length),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
    expect(res.body).toEqual(SAMPLE_PDF);
  });

  it('removes a file (204) and validates IDs', async () => {
    const server = (await app(alphaHr)).getHttpServer();
    await request(server).delete(`${base}/${EVIDENCE_ID}`).expect(204);
    await request(server).get(`${base}/not-a-uuid`).expect(400);
    await request(server)
      .delete(`/api/v1/increment-requests/x/evidence/${EVIDENCE_ID}`)
      .expect(400);
  });
});
