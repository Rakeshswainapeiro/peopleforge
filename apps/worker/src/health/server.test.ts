import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createHealthServer, type HealthOptions } from './server.js';

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

async function serve(options: HealthOptions): Promise<string> {
  const server = createHealthServer(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  close = () =>
    new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

const up = () => Promise.resolve();

describe('health server', () => {
  it('answers liveness and readiness with names and up/down only', async () => {
    const base = await serve({
      isLive: () => true,
      checks: [
        { name: 'database', check: up },
        { name: 'email', check: up },
      ],
      timeoutMs: 500,
    });
    const live = await fetch(`${base}/health/live`);
    expect(live.status).toBe(200);
    expect(live.headers.get('cache-control')).toBe('no-store');
    await expect(live.json()).resolves.toEqual({ status: 'live' });
    const ready = await fetch(`${base}/health/ready`);
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'up', email: 'up' },
    });
  });

  it('reports a stalled loop and failed, hung or odd checks, without error text', async () => {
    const base = await serve({
      isLive: () => false,
      checks: [
        { name: 'database', check: () => Promise.reject(new Error('password auth failed for x')) },
        { name: 'email', check: () => new Promise(() => undefined) },
        { name: 'other', check: () => Promise.reject(new Error('plain')) },
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a non-Error rejection
        { name: 'odd', check: () => Promise.reject('text') },
      ],
      timeoutMs: 100,
    });
    expect((await fetch(`${base}/health/live`)).status).toBe(503);
    const ready = await fetch(`${base}/health/ready`);
    expect(ready.status).toBe(503);
    const body = await ready.text();
    expect(JSON.parse(body)).toEqual({
      status: 'not_ready',
      checks: { database: 'down', email: 'down', other: 'down', odd: 'down' },
    });
    expect(body).not.toContain('password');
  });

  it('answers nothing else', async () => {
    const base = await serve({ isLive: () => true, checks: [], timeoutMs: 100 });
    expect((await fetch(`${base}/metrics`)).status).toBe(404);
    expect((await fetch(`${base}/health/live`, { method: 'POST' })).status).toBe(405);
  });
});
