import type { EmailOutbox, OutboxJob, OutboxOutcome } from '@peopleforge/db';
import { EmailDeliveryError, type EmailSender } from '@peopleforge/integrations';
import { describe, expect, it, vi } from 'vitest';
import { renderEmail } from '../email/templates.js';
import { captureLogger } from '../test-support/logger.js';
import { receivedJob, submittedJob } from '../test-support/jobs.js';
import { BACKOFF_MS, backoffFor, processBatch } from './processor.js';

function setup(jobs: OutboxJob[], send: EmailSender['send']) {
  const finished: [string, OutboxOutcome][] = [];
  const outbox: EmailOutbox = {
    claim: vi.fn(() => Promise.resolve(jobs)),
    finish: vi.fn((id: string, outcome: OutboxOutcome) => {
      finished.push([id, outcome]);
      return Promise.resolve();
    }),
    stats: vi.fn(),
  };
  const sender: EmailSender = { transport: 'file', send: vi.fn(send), ping: vi.fn() };
  const { logger, lines } = captureLogger();
  const run = () =>
    processBatch({
      outbox,
      sender,
      render: (job) => renderEmail(job, { portalUrl: 'https://hr.example.ae', locale: 'en' }),
      logger,
      maxAttempts: 3,
      batchSize: 10,
      leaseMs: 60_000,
    });
  return { outbox, sender, finished, lines, run };
}

describe('processBatch (ADR-012)', () => {
  it('sends each claimed email to its address and records it sent', async () => {
    const { outbox, sender, finished, lines, run } = setup([submittedJob(), receivedJob()], () =>
      Promise.resolve({ messageId: '<m@x>' }),
    );
    await expect(run()).resolves.toBe(2);
    expect(outbox.claim).toHaveBeenCalledWith({ limit: 10, leaseMs: 60_000 });
    expect(vi.mocked(sender.send).mock.calls.map(([email]) => email.to)).toEqual([
      'pf.alpha.hr@sirius.local',
      'pf.reviewers@sirius.local',
    ]);
    expect(finished.map(([, outcome]) => outcome)).toEqual([
      { status: 'sent', messageId: '<m@x>' },
      { status: 'sent', messageId: '<m@x>' },
    ]);
    // Logs name the outbox row and a user or a role, never an address.
    expect(lines().map((line) => [line.event, line.recipient, line.attempts])).toEqual([
      ['email_sent', 'user', 1],
      ['email_sent', 'PeopleForge.Reviewer', 1],
    ]);
    expect(JSON.stringify(lines())).not.toContain('@sirius.local');
  });

  it('skips an email without an address or that cannot be written, without sending', async () => {
    const { sender, finished, lines, run } = setup(
      [
        receivedJob({ recipient: { kind: 'role', role: 'PeopleForge.Executive', address: null } }),
        submittedJob({ kind: 'unheard_of' }),
      ],
      () => Promise.resolve({ messageId: '<m@x>' }),
    );
    await run();
    expect(sender.send).not.toHaveBeenCalled();
    expect(finished.map(([, outcome]) => outcome)).toEqual([
      { status: 'skipped', reason: 'no_address' },
      { status: 'skipped', reason: 'unknown_kind' },
    ]);
    expect(lines().map((line) => [line.event, line.level, line.attempts])).toEqual([
      ['email_skipped', 40, 0],
      ['email_skipped', 40, 0],
    ]);
  });

  it('retries a temporary failure with backoff, then gives up after the last attempt', async () => {
    const failing = () => Promise.reject(new EmailDeliveryError('smtp_421', false));
    const first = setup([submittedJob({ attempts: 0 })], failing);
    await first.run();
    expect(first.finished[0]?.[1]).toEqual({
      status: 'retry',
      delayMs: BACKOFF_MS[0],
      reason: 'smtp_421',
    });
    const last = setup([submittedJob({ attempts: 2 })], failing);
    await last.run();
    expect(last.finished[0]?.[1]).toEqual({ status: 'dead', reason: 'smtp_421' });
    expect(last.lines()[0]).toMatchObject({ event: 'email_dead', level: 50, attempts: 3 });
  });

  it('gives up at once on a permanent refusal, and treats unexpected errors as temporary', async () => {
    const refused = setup([submittedJob()], () =>
      Promise.reject(new EmailDeliveryError('smtp_550', true)),
    );
    await refused.run();
    expect(refused.finished[0]?.[1]).toEqual({ status: 'dead', reason: 'smtp_550' });
    const odd = setup([submittedJob()], () => Promise.reject(new Error('boom')));
    await odd.run();
    expect(odd.finished[0]?.[1]).toMatchObject({ status: 'retry', reason: 'unknown' });
  });

  it('claims nothing when nothing is due', async () => {
    const { run, sender } = setup([], () => Promise.resolve({ messageId: '<m@x>' }));
    await expect(run()).resolves.toBe(0);
    expect(sender.send).not.toHaveBeenCalled();
  });
});

describe('backoffFor', () => {
  it('waits 1 min, 5 min, 30 min, 2 h, then 6 h for every later attempt', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map((attempts) => backoffFor(attempts))).toEqual([
      60_000, 300_000, 1_800_000, 7_200_000, 21_600_000, 21_600_000, 21_600_000,
    ]);
    expect(backoffFor(0)).toBe(60_000);
    expect(backoffFor(3, [])).toBe(60_000);
  });
});
