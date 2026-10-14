import { IntegrationError } from './errors.js';

export interface CircuitBreakerOptions {
  dependency: IntegrationError['dependency'];
  /** Consecutive failures that open the circuit. */
  failureThreshold?: number;
  /** How long an open circuit refuses calls before letting one through again. */
  openForMs?: number;
  now?: () => number;
}

/**
 * Stops hammering a dependency that keeps failing: after `failureThreshold` consecutive
 * failures, calls fail fast for `openForMs`, then one trial call is let through (half-open).
 */
export function createCircuitBreaker(options: CircuitBreakerOptions) {
  const threshold = options.failureThreshold ?? 5;
  const openForMs = options.openForMs ?? 30_000;
  const now = options.now ?? Date.now;
  let failures = 0;
  let openedAt: number | undefined;

  return async function run<T>(work: () => Promise<T>): Promise<T> {
    if (openedAt !== undefined && now() - openedAt < openForMs) {
      throw new IntegrationError(options.dependency, 'Circuit open');
    }
    try {
      const result = await work();
      failures = 0;
      openedAt = undefined;
      return result;
    } catch (error: unknown) {
      failures += 1;
      if (failures >= threshold) openedAt = now();
      throw error;
    }
  };
}

export type CircuitBreaker = ReturnType<typeof createCircuitBreaker>;
