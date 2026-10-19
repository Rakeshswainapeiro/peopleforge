import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  AnomalyRuleSchema,
  EmployeeHistorySchema,
  EmployeePageSchema,
  FieldTemplateSchema,
  FlagDetailSchema,
  FlagPageSchema,
  FlagSchema,
  ROLES,
  UploadDetailSchema,
  UploadPageSchema,
} from '@peopleforge/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../../auth/principal.js';
import { anonymous, buildApp, errorOf, resolveAs, SUB_A } from '../../test-support/factory.js';
import {
  FLAG_ID,
  RECORD_ID,
  TEMPLATE,
  TEMPLATE_HEADERS,
  UPLOAD_ID,
  VALID_ROW,
  workingDataQuality,
  workingGroupData,
} from '../../test-support/group-data.js';
import {
  alphaHr,
  executive,
  memoryObjectStore,
  reviewer,
  stubScanner,
  type MemoryObjectStore,
} from '../../test-support/increment-requests.js';

// The group data routes (R2-01 … R2-14): authentication, permissions per route (deny by
// default, NFR-SEC-01), multipart limits, validation and file responses.

const admin: Principal = { ...reviewer, userId: 'admin', name: 'Admin', roles: [ROLES.admin] };
const CSV = Buffer.from(`${TEMPLATE_HEADERS.join(',')}\n${VALID_ROW.join(',')}\n`, 'utf8');

async function app(
  caller: Principal | null,
  store: MemoryObjectStore = memoryObjectStore(),
): Promise<NestExpressApplication> {
  return buildApp({
    resolvePrincipal: caller === null ? anonymous : resolveAs(caller),
    groupData: workingGroupData(),
    dataQuality: workingDataQuality(),
    objectStore: store,
    malwareScanner: stubScanner(),
  });
}

const g = '/api/v1/group';
const ROUTES: [string, string][] = [
  ['GET', `${g}/template`],
  ['GET', `${g}/template/file`],
  ['POST', `${g}/uploads`],
  ['GET', `${g}/uploads`],
  ['GET', `${g}/uploads/${UPLOAD_ID}`],
  ['GET', `${g}/uploads/${UPLOAD_ID}/issues`],
  ['GET', `${g}/uploads/${UPLOAD_ID}/file`],
  ['GET', `${g}/employees?period=2026-09`],
  ['GET', `${g}/employees/${RECORD_ID}/history`],
  ['GET', `${g}/extract?format=csv&period=2026-09`],
  ['GET', `${g}/flags`],
  ['GET', `${g}/flags/${FLAG_ID}`],
  ['PATCH', `${g}/flags/${FLAG_ID}`],
  ['POST', `${g}/flags/${FLAG_ID}/remind`],
  ['GET', '/api/v1/settings/template'],
  ['PUT', '/api/v1/settings/template'],
  ['GET', '/api/v1/settings/anomaly-rules'],
  ['PUT', '/api/v1/settings/anomaly-rules/ANM-03'],
];

type Method = 'get' | 'post' | 'put' | 'patch';
const call = (server: unknown, method: string, path: string) =>
  request(server as Parameters<typeof request>[0])[method.toLowerCase() as Method](path);

describe('group data routes: access [R2-12, NFR-SEC-01]', () => {
  it.each(ROUTES)('refuses %s %s without a session (401)', async (method, path) => {
    const res = await call((await app(null)).getHttpServer(), method, path).expect(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  const forbidden: (readonly [Principal, string, string])[] = [
    // Executives see aggregates only (D8), never employee rows, files or flags.
    ...ROUTES.slice(0, 14).map(([method, path]) => [executive, method, path] as const),
    // Admins configure; they don't read employee data.
    [admin, 'GET', `${g}/employees?period=2026-09`],
    [admin, 'POST', `${g}/uploads`],
    // Subsidiary HR doesn't extract raw data or configure.
    [alphaHr, 'GET', `${g}/extract?format=csv&period=2026-09`],
    [alphaHr, 'PUT', '/api/v1/settings/template'],
    [alphaHr, 'GET', '/api/v1/settings/anomaly-rules'],
    // Sirius HR reviewers don't upload a subsidiary's data.
    [reviewer, 'POST', `${g}/uploads`],
  ];
  it.each(forbidden)(
    'refuses %# without the permission (403), before reading a body',
    async (caller, method, path) => {
      const store = memoryObjectStore();
      const res = await call((await app(caller, store)).getHttpServer(), method, path).expect(403);
      expect(errorOf(res).code).toBe('FORBIDDEN');
      expect(store.put).not.toHaveBeenCalled();
    },
  );
});

describe('template and uploads [R2-01 … R2-04]', () => {
  it('serves the template as JSON and as an Excel download', async () => {
    const server = (await app(alphaHr)).getHttpServer();
    const json = await request(server).get(`${g}/template`).expect(200);
    expect(FieldTemplateSchema.parse(json.body).fields).toHaveLength(TEMPLATE.fields.length);
    const file = await request(server).get(`${g}/template/file?locale=ar`).expect(200);
    expect(file.headers['content-type']).toContain('spreadsheetml');
    expect(file.headers['content-disposition']).toContain('template-v1.xlsx');
    expect(file.headers['cache-control']).toBe('private, no-store');
    await request(server).get(`${g}/template/file?locale=fr`).expect(400);
  });

  it('uploads a CSV as multipart form data', async () => {
    const store = memoryObjectStore();
    const server = (await app(alphaHr, store)).getHttpServer();
    const res = await request(server)
      .post(`${g}/uploads`)
      .field('entityId', SUB_A)
      .field('period', '2026-09')
      .attach('file', CSV, { filename: 'بيانات.csv', contentType: 'application/pdf' })
      .expect(201);
    const upload = UploadDetailSchema.parse(res.body);
    expect(upload).toMatchObject({ status: 'accepted', rows: 1 });
    expect([...store.objects.keys()]).toEqual([`group-uploads/${SUB_A}/${upload.id}`]);
  });

  it('refuses bad fields, extra fields, two files and files over 5 MB', async () => {
    const server = (await app(alphaHr)).getHttpServer();
    const bad = await request(server)
      .post(`${g}/uploads`)
      .field('entityId', SUB_A)
      .field('period', '2026-13')
      .attach('file', CSV, 'a.csv')
      .expect(400);
    expect(errorOf(bad).details?.[0]?.path).toBe('period');
    await request(server)
      .post(`${g}/uploads`)
      .field('entityId', SUB_A)
      .field('period', '2026-09')
      .field('extra', 'x')
      .attach('file', CSV, 'a.csv')
      .expect(400);
    await request(server)
      .post(`${g}/uploads`)
      .field('entityId', SUB_A)
      .field('period', '2026-09')
      .attach('file', CSV, 'a.csv')
      .attach('file', CSV, 'b.csv')
      .expect(400);
    const big = await request(server)
      .post(`${g}/uploads`)
      .field('entityId', SUB_A)
      .field('period', '2026-09')
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1, 0x41), 'big.csv')
      .expect(413);
    expect(errorOf(big).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('lists uploads, shows one, and serves its problems and original file', async () => {
    const store = memoryObjectStore();
    store.objects.set(`group-uploads/${SUB_A}/${UPLOAD_ID}`, CSV);
    const server = (await app(alphaHr, store)).getHttpServer();
    UploadPageSchema.parse(
      (await request(server).get(`${g}/uploads?period=2026-09`).expect(200)).body,
    );
    await request(server).get(`${g}/uploads?pageSize=7`).expect(400);
    UploadDetailSchema.parse(
      (await request(server).get(`${g}/uploads/${UPLOAD_ID}`).expect(200)).body,
    );
    await request(server).get(`${g}/uploads/not-an-id`).expect(400);
    const issues = await request(server).get(`${g}/uploads/${UPLOAD_ID}/issues`).expect(200);
    expect(issues.headers['content-disposition']).toContain('UP-0001-problems.xlsx');
    const original = await request(server).get(`${g}/uploads/${UPLOAD_ID}/file`).expect(200);
    expect(original.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(original.headers['cache-control']).toBe('private, no-store');
  });
});

describe('records and extract [R2-03, R2-04, R2-08]', () => {
  it('pages employees and shows an employee history', async () => {
    const server = (await app(alphaHr)).getHttpServer();
    EmployeePageSchema.parse(
      (await request(server).get(`${g}/employees?period=2026-09&search=aisha`).expect(200)).body,
    );
    await request(server).get(`${g}/employees`).expect(400);
    EmployeeHistorySchema.parse(
      (await request(server).get(`${g}/employees/${RECORD_ID}/history`).expect(200)).body,
    );
  });

  it('extracts raw data for Sirius HR as a CSV download', async () => {
    const server = (await app(reviewer)).getHttpServer();
    const res = await request(server)
      .get(`${g}/extract?format=palmhr&period=2026-09&allVersions=true`)
      .expect(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toContain('palm-hr.csv');
    await request(server).get(`${g}/extract?format=pdf&period=2026-09`).expect(400);
  });
});

describe('flags [R2-10, R2-11]', () => {
  it('lists, shows, updates and reminds', async () => {
    const server = (await app(reviewer)).getHttpServer();
    FlagPageSchema.parse((await request(server).get(`${g}/flags?period=2026-09`).expect(200)).body);
    FlagDetailSchema.parse((await request(server).get(`${g}/flags/${FLAG_ID}`).expect(200)).body);
    const updated = await request(server)
      .patch(`${g}/flags/${FLAG_ID}`)
      .send({ ownerId: null, status: 'resolved', note: 'Checked with payroll.' })
      .expect(200);
    expect(FlagSchema.parse(updated.body).status).toBe('resolved');
    const noNote = await request(server)
      .patch(`${g}/flags/${FLAG_ID}`)
      .send({ ownerId: null, status: 'resolved', note: '' })
      .expect(400);
    expect(errorOf(noNote).details?.[0]?.path).toBe('note');
    await request(server).post(`${g}/flags/${FLAG_ID}/remind`).expect(204);
  });

  it('lets subsidiary HR work its flags but not send reminders', async () => {
    const server = (await app(alphaHr)).getHttpServer();
    await request(server)
      .patch(`${g}/flags/${FLAG_ID}`)
      .send({ ownerId: null, status: 'in_progress', note: null })
      .expect(200);
    await request(server).post(`${g}/flags/${FLAG_ID}/remind`).expect(403);
  });
});

describe('group data settings [R2-02, R2-10, NFR-CFG-01]', () => {
  it('lets an admin read and publish the template and change anomaly rules', async () => {
    const server = (await app(admin)).getHttpServer();
    const template = FieldTemplateSchema.parse(
      (await request(server).get('/api/v1/settings/template').expect(200)).body,
    );
    const published = await request(server)
      .put('/api/v1/settings/template')
      .send({
        version: template.version,
        fields: template.fields.map(({ core: _core, ...field }) => field),
      })
      .expect(200);
    expect(FieldTemplateSchema.parse(published.body).version).toBe(2);
    await request(server)
      .put('/api/v1/settings/template')
      .send({ version: 1, fields: [] })
      .expect(400);
    const rules = await request(server).get('/api/v1/settings/anomaly-rules').expect(200);
    expect(AnomalyRuleSchema.array().parse(rules.body)).toHaveLength(3);
    await request(server)
      .put('/api/v1/settings/anomaly-rules/ANM-03')
      .send({ threshold: '25', enabled: true })
      .expect(200);
    await request(server)
      .put('/api/v1/settings/anomaly-rules/bad')
      .send({ threshold: '25', enabled: true })
      .expect(400);
  });
});
