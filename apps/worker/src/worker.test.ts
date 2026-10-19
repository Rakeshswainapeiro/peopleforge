import type { DatabaseHandle, EmailOutbox } from '@peopleforge/db';
import type { EmailSender } from '@peopleforge/integrations';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from './config/env.js';
import { captureLogger } from './test-support/logger.js';
import { submittedJob } from './test-support/jobs.js';

const outbox: EmailOutbox = {
  claim: vi.fn(),
  finish: vi.fn(() => Promise.resolve()),
  stats: vi.fn(() => Promise.resolve({ pending: 0, due: 0, dead: 0, oldestDueSeconds: 0 })),
};

const queueReminders = vi.fn(() => Promise.resolve(1));
const queueGroupReminders = vi.fn(() => Promise.resolve(2));

vi.mock('@peopleforge/db', () => ({
  createEmailOutbox: () => outbox,
  queueReminders,
  queueGroupReminders,
}));

const { createWorker } = await import('./worker.js');

const env = {
  ...loadEnv({
    APP_ENV: 'test',
    WORKER_DATABASE_URL: 'postgres://w:x@localhost:5432/db',
    PORTAL_URL: 'https://hr.example.ae',
    EMAIL_TRANSPORT: 'file',
    EMAIL_FILE_DIR: '/tmp/unused',
    EMAIL_FROM: 'no-reply@peopleforge.local',
    OUTBOX_POLL_MS: '500',
    OUTBOX_LEASE_MS: '200000',
  }),
  // Any free port for the probes.
  HEALTH_PORT: 0,
};

function dependencies(now = () => Date.now()) {
  const database: DatabaseHandle = {
    db: {} as DatabaseHandle['db'],
    ping: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  const sender: EmailSender = {
    transport: 'file',
    send: vi.fn(() => Promise.resolve({ messageId: '<m@x>' })),
    ping: vi.fn(() => Promise.resolve()),
  };
  const captured = captureLogger();
  return { database, sender, captured, now };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('createWorker', () => {
  it('sends due emails with links to the portal, answers probes, and stops cleanly', async () => {
    vi.mocked(outbox.claim).mockResolvedValueOnce([submittedJob()]).mockResolvedValue([]);
    const { database, sender, captured } = dependencies();
    const worker = createWorker({ env, logger: captured.logger, database, sender });
    const server = await worker.start();
    const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    await vi.waitFor(() => {
      expect(sender.send).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(sender.send).mock.calls[0]?.[0].text).toContain(
      'https://hr.example.ae/requests/',
    );
    expect(outbox.claim).toHaveBeenCalledWith({ limit: 10, leaseMs: 200_000 });
    // The configured reminder triggers are checked at start, on the worker's database (R1-13).
    expect(queueReminders).toHaveBeenCalledWith(database.db);
    expect(queueGroupReminders).toHaveBeenCalledWith(database.db);
    expect((await fetch(`${base}/health/live`)).status).toBe(200);
    await expect((await fetch(`${base}/health/ready`)).json()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'up', email: 'up' },
    });
    await worker.stop();
    expect(database.close).toHaveBeenCalled();
    expect(captured.lines().map((line) => line.msg)).toContain('Worker stopped');
    expect(captured.lines().find((line) => line.msg === 'Worker started')).toMatchObject({
      transport: 'file',
      appEnv: 'test',
    });
  });

  it('reports itself stalled when no batch has succeeded for three leases', async () => {
    vi.mocked(outbox.claim).mockRejectedValue(new Error('db down'));
    let clock = 1_000;
    const { database, sender, captured } = dependencies();
    const worker = createWorker({
      env,
      logger: captured.logger,
      database,
      sender,
      now: () => clock,
    });
    const server = await worker.start();
    const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    expect((await fetch(`${base}/health/live`)).status).toBe(200);
    clock += 600_000;
    expect((await fetch(`${base}/health/live`)).status).toBe(503);
    await worker.stop();
  });

  it('can be stopped before it started (a failed start still releases the database)', async () => {
    const { database, sender, captured } = dependencies();
    const worker = createWorker({ env, logger: captured.logger, database, sender });
    await expect(worker.stop()).resolves.toBeUndefined();
    expect(database.close).toHaveBeenCalled();
  });
});
