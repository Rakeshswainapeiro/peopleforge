import type { ReadinessResponse } from '@sirius/shared-types';

/** A dependency the API cannot serve traffic without (database, cache, object storage). */
export interface ReadinessCheck {
  name: string;
  check: (signal: AbortSignal) => Promise<void>;
}

async function runCheck(check: ReadinessCheck, timeoutMs: number): Promise<boolean> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    await Promise.race([
      check.check(signal),
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('timeout'));
        });
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs all checks in parallel with a per-check timeout so a hung dependency makes the pod
 * unready quickly instead of stalling the orchestrator's probe.
 */
export async function evaluateReadiness(
  checks: readonly ReadinessCheck[],
  timeoutMs: number,
): Promise<ReadinessResponse> {
  const results = await Promise.all(
    checks.map(async (check) => [check.name, await runCheck(check, timeoutMs)] as const),
  );
  const entries = results.map(([name, ok]) => [name, ok ? 'up' : 'down'] as const);
  return {
    status: results.every(([, ok]) => ok) ? 'ready' : 'not_ready',
    checks: Object.fromEntries(entries),
  };
}
