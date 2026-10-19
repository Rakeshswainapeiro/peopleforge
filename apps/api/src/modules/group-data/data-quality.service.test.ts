import { FlagDetailSchema, FlagPageSchema, FlagSchema } from '@peopleforge/contracts';
import { DataQualityError, type FlagContext, type NewNotification } from '@peopleforge/db';
import { describe, expect, it } from 'vitest';
import { SUB_A } from '../../test-support/factory.js';
import { FLAG_ID, flagRecord, workingDataQuality } from '../../test-support/group-data.js';
import { alphaHr, executive, reviewer } from '../../test-support/increment-requests.js';
import { DataQualityService } from './data-quality.service.js';

// Anomaly rules and flags (R2-10, R2-11, DASH-D7): what callers see, who may own a flag, the
// owner's notices and the reminder.

function setup() {
  const repository = workingDataQuality();
  return { repository, service: new DataQualityService(repository) };
}

async function failure(promise: Promise<unknown>) {
  const error: unknown = await promise.then(
    () => new Error('expected a failure'),
    (reason: unknown) => reason,
  );
  return error as { status: number; details?: { path: string; code: string }[] };
}

/** The notices the repository was asked to create on the last update. */
function noticesOf(call: unknown[] | undefined, flag = flagRecord()): readonly NewNotification[] {
  const input = call?.[2] as {
    notifications: (context: FlagContext) => readonly NewNotification[];
  };
  return input.notifications({ flag });
}

describe('anomaly rules [R2-10, NFR-CFG-01]', () => {
  it('lists and updates rules with the admin name', async () => {
    const { service, repository } = setup();
    expect((await service.rules(reviewer)).map((rule) => rule.kind)).toEqual([
      'missing_employee',
      'salary_change',
      'increment_mismatch',
    ]);
    const updated = await service.updateRule(reviewer, 'ANM-03', {
      threshold: '25',
      enabled: true,
    });
    expect(updated).toMatchObject({ code: 'ANM-03', threshold: '25' });
    expect(repository.updateRule).toHaveBeenCalledWith(expect.anything(), 'ANM-03', {
      threshold: '25',
      enabled: true,
      actorName: 'Reviewer',
    });
    repository.updateRule.mockRejectedValueOnce(new DataQualityError('not_found'));
    expect(
      (await failure(service.updateRule(reviewer, 'ANM-99', { threshold: null, enabled: true })))
        .status,
    ).toBe(404);
  });
});

describe('flags [R2-10, R2-11, DASH-D7]', () => {
  it('pages flags with counts, per subsidiary bars and the month variations', async () => {
    const { service, repository } = setup();
    const page = FlagPageSchema.parse(
      await service.flags(reviewer, {
        period: '2026-09',
        entityId: SUB_A,
        status: 'open',
        rule: 'ANM-03',
        page: 1,
        pageSize: 10,
      }),
    );
    expect(page).toMatchObject({ total: 1, counts: { open: 1 }, variations: [{ flags: 1 }] });
    expect(repository.flagsByEntity).toHaveBeenCalledWith(expect.anything(), {
      period: '2026-09',
      entityId: SUB_A,
      status: undefined,
      ruleCode: 'ANM-03',
    });
    repository.flags.mockResolvedValueOnce({
      items: [],
      total: 0,
      counts: { open: 0, in_progress: 0, resolved: 0 },
      oldestOpenAt: null,
    });
    const any = await service.flags(alphaHr, { page: 1, pageSize: 10 });
    expect(any).toMatchObject({ variations: [], oldestOpenAt: null });
    expect(repository.variations).toHaveBeenCalledTimes(1);
  });

  it('hides the values (pay) from callers without compensation access', async () => {
    const { service } = setup();
    const page = await service.flags(executive, { page: 1, pageSize: 10 });
    expect(page.items[0]?.detail).toEqual({});
  });

  it('shows a flag with its activity (display values only) and possible owners', async () => {
    const { service, repository } = setup();
    const detail = FlagDetailSchema.parse(await service.flag(reviewer, FLAG_ID));
    expect(detail.activity).toEqual([
      {
        action: 'anomaly_flag.raised',
        actorName: 'Alpha HR',
        at: '2026-10-05T06:00:00.000Z',
        details: { rule: 'ANM-03' },
      },
    ]);
    expect(detail.owners).toEqual([{ id: 'alpha', name: 'Alpha HR' }]);
    repository.flag.mockResolvedValueOnce(null);
    expect((await failure(service.flag(reviewer, FLAG_ID))).status).toBe(404);
  });

  it('assigns to a known owner or the caller, and refuses anyone else', async () => {
    const { service, repository } = setup();
    await service.updateFlag(reviewer, FLAG_ID, {
      ownerId: 'alpha',
      status: 'in_progress',
      note: null,
    });
    expect(repository.updateFlag.mock.calls[0]?.[2]).toMatchObject({
      owner: { id: 'alpha', name: 'Alpha HR' },
      status: 'in_progress',
    });
    await service.updateFlag(reviewer, FLAG_ID, {
      ownerId: 'reviewer',
      status: 'open',
      note: null,
    });
    expect(repository.updateFlag.mock.calls[1]?.[2]).toMatchObject({
      owner: { id: 'reviewer', name: 'Reviewer' },
    });
    const stranger = await failure(
      service.updateFlag(reviewer, FLAG_ID, { ownerId: 'someone', status: 'open', note: null }),
    );
    expect(stranger.details).toEqual([{ path: 'ownerId', code: 'not_found' }]);
    repository.flag.mockResolvedValueOnce(null);
    expect(
      (
        await failure(
          service.updateFlag(reviewer, FLAG_ID, { ownerId: 'alpha', status: 'open', note: null }),
        )
      ).status,
    ).toBe(404);
  });

  it('resolves with a note, telling the owner unless they did it themselves', async () => {
    const { service, repository } = setup();
    const flag = FlagSchema.parse(
      await service.updateFlag(reviewer, FLAG_ID, {
        ownerId: null,
        status: 'resolved',
        note: 'Checked.',
      }),
    );
    expect(flag).toMatchObject({ status: 'resolved', note: 'Checked.' });
    expect(
      noticesOf(repository.updateFlag.mock.calls[0], flagRecord({ status: 'resolved' })),
    ).toEqual([
      expect.objectContaining({
        recipient: { userId: 'alpha' },
        kind: 'flag_updated',
        actionNeeded: false,
        params: expect.objectContaining({ actor: 'Reviewer', flagStatus: 'resolved' }) as unknown,
      }),
    ]);
    expect(noticesOf(repository.updateFlag.mock.calls[0])[0]?.actionNeeded).toBe(true);
    await service.updateFlag(alphaHr, FLAG_ID, {
      ownerId: null,
      status: 'in_progress',
      note: null,
    });
    expect(noticesOf(repository.updateFlag.mock.calls[1])).toEqual([]);
  });

  it('refuses changing a superseded flag (409)', async () => {
    const { service, repository } = setup();
    repository.updateFlag.mockRejectedValueOnce(new DataQualityError('superseded'));
    const error = await failure(
      service.updateFlag(alphaHr, FLAG_ID, { ownerId: null, status: 'open', note: null }),
    );
    expect(error).toMatchObject({ status: 409, details: [{ path: 'status', code: 'superseded' }] });
    repository.updateFlag.mockRejectedValueOnce(new Error('database down'));
    await expect(
      service.updateFlag(alphaHr, FLAG_ID, { ownerId: null, status: 'open', note: null }),
    ).rejects.toThrow('database down');
  });

  it('lets only Sirius HR send a reminder to the owner', async () => {
    const { service, repository } = setup();
    await service.remind(reviewer, FLAG_ID);
    const notify = repository.remind.mock.calls[0]?.[2] as (
      context: FlagContext,
    ) => NewNotification[];
    expect(notify({ flag: flagRecord() })).toEqual([
      expect.objectContaining({
        recipient: { userId: 'alpha' },
        kind: 'flag_reminder',
        actionNeeded: true,
      }),
    ]);
    expect((await failure(service.remind(alphaHr, FLAG_ID))).status).toBe(403);
  });
});
