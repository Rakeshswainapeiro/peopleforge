import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DashboardSummarySchema,
  IncrementRequestPageSchema,
  RequestLinePageSchema,
} from '@peopleforge/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../../auth/principal.js';
import { anonymous, buildApp, errorOf, resolveAs } from '../../test-support/factory.js';
import {
  alphaHr,
  CYCLE_ID,
  executive,
  REQUEST_ID,
  reviewer,
  workingDashboard,
} from '../../test-support/increment-requests.js';

async function app(
  caller: Principal | null,
  dashboard = workingDashboard(),
): Promise<NestExpressApplication> {
  return buildApp({
    resolvePrincipal: caller === null ? anonymous : resolveAs(caller),
    dashboard,
  });
}

const SUMMARY = '/api/v1/increment-requests/summary';
const REQUESTS = '/api/v1/increment-requests';
const LINES = '/api/v1/increment-request-lines';

describe('dashboard routes [R1-10, NFR-SEC-01]', () => {
  it.each([SUMMARY, REQUESTS, LINES])('refuses GET %s without a session (401)', async (path) => {
    const res = await request((await app(null)).getHttpServer())
      .get(path)
      .expect(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  it.each([SUMMARY, REQUESTS, LINES])(
    'refuses executives GET %s: individual requests are not theirs (403)',
    async (path) => {
      const res = await request((await app(executive)).getHttpServer())
        .get(path)
        .expect(403);
      expect(errorOf(res).code).toBe('FORBIDDEN');
    },
  );

  it('answers subsidiary HR with the documented shapes, filters parsed and normalised', async () => {
    const dashboard = workingDashboard();
    const server = (await app(alphaHr, dashboard)).getHttpServer();
    const query = `cycleId=${CYCLE_ID}&status=draft&search=%20Rene%CC%81%20`;
    const summary = await request(server).get(`${SUMMARY}?${query}`).expect(200);
    expect(DashboardSummarySchema.parse(summary.body)).toEqual({
      byStatus: {
        draft: 2,
        submitted: 0,
        under_review: 0,
        returned: 0,
        approved: 0,
        partly_approved: 0,
        rejected: 0,
      },
      requests: 2,
      employees: 3,
    });
    expect(dashboard.summary).toHaveBeenCalledWith(expect.anything(), {
      cycleId: CYCLE_ID,
      status: 'draft',
      search: 'René',
      includeDrafts: true,
    });
    const requests = await request(server).get(`${REQUESTS}?${query}&pageSize=25`).expect(200);
    expect(IncrementRequestPageSchema.parse(requests.body).items[0]?.criteria).toEqual({
      complete: 1,
      total: 10,
    });
    const lines = await request(server).get(`${LINES}?requestId=${REQUEST_ID}&page=2`).expect(200);
    expect(RequestLinePageSchema.parse(lines.body)).toMatchObject({ page: 2, total: 1 });
  });

  it('serves Sirius reviewers too, without drafts', async () => {
    const dashboard = workingDashboard();
    await request((await app(reviewer, dashboard)).getHttpServer())
      .get(LINES)
      .expect(200);
    expect(dashboard.lines).toHaveBeenCalledWith(expect.anything(), {
      includeDrafts: false,
      limit: 10,
      offset: 0,
    });
  });

  it.each([
    [SUMMARY, 'cycleId=Q3-2026', 'cycleId'],
    [SUMMARY, 'page=2', ''],
    [REQUESTS, 'pageSize=1000', 'pageSize'],
    [REQUESTS, 'status=archived', 'status'],
    [LINES, 'requestId=INC-2026-0001', 'requestId'],
    [LINES, `search=${'x'.repeat(101)}`, 'search'],
  ])('refuses GET %s?%s (400 naming %s)', async (path, query, field) => {
    const res = await request((await app(alphaHr)).getHttpServer())
      .get(`${path}?${query}`)
      .expect(400);
    expect(errorOf(res).code).toBe('VALIDATION_FAILED');
    expect(errorOf(res).details?.map((detail) => detail.path)).toContain(field);
  });
});
