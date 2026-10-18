import { CriteriaSettingsSchema, ReminderRuleSchema, ROLES } from '@peopleforge/contracts';
import { SettingsDataError, type SettingsRepository } from '@peopleforge/db';
import request from 'supertest';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { Principal } from '../../auth/principal.js';
import {
  anonymous,
  buildApp,
  errorOf,
  resolveAs,
  unusedSettings,
} from '../../test-support/factory.js';
import { alphaHr, record, reviewer } from '../../test-support/increment-requests.js';
import { SettingsService } from './settings.service.js';

// Settings (R1-05, R1-13, NFR-CFG-01): admins change the criteria (as new versions) and the
// reminder triggers; nobody else may even read them here.
const admin: Principal = {
  userId: 'admin-1',
  username: 'pf.admin',
  name: 'Admin Test',
  roles: [ROLES.admin],
  scope: 'group',
};
const SET_ID = '00000000-0000-4000-8000-0000000c5e72';
const CHANGED = new Date('2026-10-18T06:00:00Z');
const criteria = record().criteria.map((criterion) => ({ ...criterion, maxFileMb: 50 }));

type Fake = { [K in keyof SettingsRepository]: Mock<SettingsRepository[K]> };

function fake(): Fake {
  return {
    reminderRules: vi.fn<SettingsRepository['reminderRules']>(() =>
      Promise.resolve([
        {
          kind: 'review_overdue',
          days: 2,
          enabled: true,
          updatedAt: CHANGED,
          updatedByName: null,
        },
      ]),
    ),
    updateReminderRule: vi.fn<SettingsRepository['updateReminderRule']>((_scope, kind, input) =>
      Promise.resolve({
        kind,
        days: input.days,
        enabled: input.enabled,
        updatedAt: CHANGED,
        updatedByName: input.actorName,
      }),
    ),
    activeCriteria: vi.fn<SettingsRepository['activeCriteria']>(() =>
      Promise.resolve({ id: SET_ID, version: 2, activatedAt: CHANGED, criteria }),
    ),
    publishCriteria: vi.fn<SettingsRepository['publishCriteria']>(() =>
      Promise.resolve({ id: SET_ID, version: 3, activatedAt: null, criteria }),
    ),
  };
}

const edits = criteria.map((criterion) => ({
  code: criterion.code,
  name: { en: `Rule ${criterion.code}` },
  description: { en: 'Checked.' },
  justificationRequired: true,
  evidencePolicy: 'required',
  maxFileMb: 5,
}));

async function server(caller: Principal | null, repository: SettingsRepository = fake()) {
  const app = await buildApp({
    resolvePrincipal: caller === null ? anonymous : resolveAs(caller),
    settings: repository,
  });
  return app.getHttpServer();
}

describe('SettingsService [R1-05, R1-13]', () => {
  it('lists and changes reminder triggers, recording the admin’s name', async () => {
    const repository = fake();
    const service = new SettingsService(repository);
    const rules = await service.reminderRules(admin);
    expect(rules).toEqual([
      {
        kind: 'review_overdue',
        days: 2,
        enabled: true,
        updatedAt: '2026-10-18T06:00:00.000Z',
        updatedByName: null,
      },
    ]);
    expect(rules.every((rule) => ReminderRuleSchema.safeParse(rule).success)).toBe(true);
    await expect(
      service.updateReminderRule(admin, 'return_overdue', { days: 4, enabled: false }),
    ).resolves.toMatchObject({ kind: 'return_overdue', days: 4, updatedByName: 'Admin Test' });
    expect(repository.updateReminderRule).toHaveBeenCalledWith(
      { userId: 'admin-1', userName: 'Admin Test', kind: 'group' },
      'return_overdue',
      { days: 4, enabled: false, actorName: 'Admin Test' },
    );
  });

  it('gives the active criteria with the effective file limit, and publishes new versions', async () => {
    const repository = fake();
    const service = new SettingsService(repository);
    const active = await service.criteria(admin);
    expect(CriteriaSettingsSchema.parse(active)).toMatchObject({
      version: 2,
      activatedAt: '2026-10-18T06:00:00.000Z',
    });
    // Capped at the portal's per-file limit.
    expect(active.criteria[0]?.maxFileMb).toBe(10);
    await expect(
      service.publishCriteria(admin, { version: 2, criteria: [] }),
    ).resolves.toMatchObject({ version: 3, activatedAt: null });
  });

  it.each([
    ['not_found', 404, 'NOT_FOUND'],
    ['version_conflict', 409, 'CONFLICT'],
    ['criteria_mismatch', 400, 'VALIDATION_FAILED'],
  ] as const)('maps %s to %i', async (reason, status, code) => {
    const repository = fake();
    repository.publishCriteria.mockRejectedValue(new SettingsDataError(reason));
    const res = await request(await server(admin, repository))
      .put('/api/v1/settings/criteria')
      .send({ version: 2, criteria: edits })
      .expect(status);
    expect(errorOf(res).code).toBe(code);
  });

  it('lets unexpected failures through as server errors', async () => {
    const repository = fake();
    repository.activeCriteria.mockRejectedValue(new Error('connection refused'));
    await request(await server(admin, repository))
      .get('/api/v1/settings/criteria')
      .expect(500);
  });
});

describe('settings routes [NFR-SEC-01, NFR-CFG-01]', () => {
  it('refuses no session (401) and everyone but admins (403)', async () => {
    expect(
      errorOf(
        await request(await server(null))
          .get('/api/v1/settings/reminders')
          .expect(401),
      ).code,
    ).toBe('UNAUTHENTICATED');
    for (const caller of [reviewer, alphaHr]) {
      const http = await server(caller);
      await request(http).get('/api/v1/settings/reminders').expect(403);
      await request(http).get('/api/v1/settings/criteria').expect(403);
      await request(http).put('/api/v1/settings/criteria').send({}).expect(403);
      await request(http)
        .put('/api/v1/settings/reminders/review_overdue')
        .send({ days: 1, enabled: true })
        .expect(403);
    }
  });

  it('serves admins, validating every input', async () => {
    const repository = fake();
    const http = await server(admin, repository);
    await request(http).get('/api/v1/settings/reminders').expect(200);
    const updated = await request(http)
      .put('/api/v1/settings/reminders/deadline_approaching')
      .send({ days: 5, enabled: true })
      .expect(200);
    expect(updated.body).toMatchObject({ kind: 'deadline_approaching', days: 5 });
    await request(http)
      .put('/api/v1/settings/reminders/everything')
      .send({ days: 5, enabled: true })
      .expect(400);
    await request(http)
      .put('/api/v1/settings/reminders/review_overdue')
      .send({ days: 0, enabled: true })
      .expect(400);
    const active = await request(http).get('/api/v1/settings/criteria').expect(200);
    expect(active.body).toMatchObject({ id: SET_ID, version: 2 });
    await request(http)
      .put('/api/v1/settings/criteria')
      .send({ version: 2, criteria: edits })
      .expect(200);
    expect(repository.publishCriteria.mock.calls[0]?.[1].criteria[0]).toEqual({
      code: 'C1',
      name: { en: 'Rule C1', ar: undefined },
      description: { en: 'Checked.', ar: undefined },
      justificationRequired: true,
      evidencePolicy: 'required',
      maxFileMb: 5,
    });
    await request(http)
      .put('/api/v1/settings/criteria')
      .send({ version: 2, criteria: [{ ...edits[0], name: { en: '' } }] })
      .expect(400);
  });

  it('keeps the shared fake honest', async () => {
    await expect(unusedSettings.reminderRules({ userId: 'x', kind: 'group' })).rejects.toThrow();
  });
});
