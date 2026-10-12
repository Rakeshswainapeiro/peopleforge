import { describe, expect, it } from 'vitest';
import { evaluateReadiness } from './readiness.js';

describe('evaluateReadiness', () => {
  it('is ready with no dependencies registered', async () => {
    await expect(evaluateReadiness([], 100)).resolves.toEqual({ status: 'ready', checks: {} });
  });

  it('marks a check that exceeds the timeout as down', async () => {
    const hanging = { name: 'database', check: () => new Promise<void>(() => undefined) };
    const result = await evaluateReadiness([hanging], 100);
    expect(result).toEqual({ status: 'not_ready', checks: { database: 'down' } });
  });

  it('passes an abort signal so checks can cancel their own work', async () => {
    let received: AbortSignal | undefined;
    await evaluateReadiness(
      [
        {
          name: 'cache',
          check: (signal) => {
            received = signal;
            return Promise.resolve();
          },
        },
      ],
      100,
    );
    expect(received).toBeInstanceOf(AbortSignal);
  });
});
