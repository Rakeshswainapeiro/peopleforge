import { describe, expect, it } from 'vitest';
import { createCircuitBreaker } from './circuit-breaker.js';
import { IntegrationError } from './errors.js';

function clock(start = 0) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

const fail = () => Promise.reject(new Error('boom'));

describe('createCircuitBreaker', () => {
  it('passes results through and keeps the circuit closed', async () => {
    const run = createCircuitBreaker({ dependency: 'object_store' });
    await expect(run(() => Promise.resolve(42))).resolves.toBe(42);
  });

  it('rethrows failures unchanged while below the threshold', async () => {
    const run = createCircuitBreaker({ dependency: 'object_store', failureThreshold: 2 });
    await expect(run(fail)).rejects.toThrow('boom');
    await expect(run(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('opens after consecutive failures and fails fast without calling the dependency', async () => {
    const time = clock();
    const run = createCircuitBreaker({
      dependency: 'malware_scanner',
      failureThreshold: 2,
      openForMs: 1_000,
      now: time.now,
    });
    await expect(run(fail)).rejects.toThrow('boom');
    await expect(run(fail)).rejects.toThrow('boom');
    let called = false;
    const error = await run(() => {
      called = true;
      return Promise.resolve();
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({ dependency: 'malware_scanner', message: 'Circuit open' });
    expect(called).toBe(false);
  });

  it('lets a trial call through once the open period ends, and closes on success', async () => {
    const time = clock();
    const run = createCircuitBreaker({
      dependency: 'object_store',
      failureThreshold: 1,
      openForMs: 1_000,
      now: time.now,
    });
    await expect(run(fail)).rejects.toThrow('boom');
    time.advance(999);
    await expect(run(() => Promise.resolve(1))).rejects.toThrow('Circuit open');
    time.advance(1);
    await expect(run(() => Promise.resolve(2))).resolves.toBe(2);
    await expect(run(() => Promise.resolve(3))).resolves.toBe(3);
  });

  it('re-opens straight away when the trial call fails', async () => {
    const time = clock();
    const run = createCircuitBreaker({
      dependency: 'object_store',
      failureThreshold: 1,
      openForMs: 1_000,
      now: time.now,
    });
    await expect(run(fail)).rejects.toThrow('boom');
    time.advance(1_000);
    await expect(run(fail)).rejects.toThrow('boom');
    await expect(run(() => Promise.resolve())).rejects.toThrow('Circuit open');
  });

  it('defaults to five failures and the wall clock', async () => {
    const run = createCircuitBreaker({ dependency: 'object_store' });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(run(fail)).rejects.toThrow('boom');
    }
    await expect(run(() => Promise.resolve())).rejects.toThrow('Circuit open');
  });
});
