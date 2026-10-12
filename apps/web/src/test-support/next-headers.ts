import { vi, type Mock } from 'vitest';

export interface FakeCookieStore {
  get: Mock<(name: string) => { name: string; value: string } | undefined>;
  set: Mock<(name: string, value: string) => void>;
}

/** In-memory stand-in for the `cookies()` store from next/headers. */
export function fakeCookieStore(initial: Record<string, string> = {}): FakeCookieStore {
  const values = new Map(Object.entries(initial));
  return {
    get: vi.fn((name: string) => {
      const value = values.get(name);
      return value === undefined ? undefined : { name, value };
    }),
    set: vi.fn((name: string, value: string) => {
      values.set(name, value);
    }),
  };
}
