import { cookies } from 'next/headers';
import { describe, expect, it, vi } from 'vitest';
import { fakeCookieStore } from '@/test-support/next-headers';
import { getRequestLocale, LOCALE_COOKIE } from './request-locale';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

function withCookies(values: Record<string, string>) {
  vi.mocked(cookies).mockResolvedValue(
    fakeCookieStore(values) as unknown as Awaited<ReturnType<typeof cookies>>,
  );
}

describe('getRequestLocale', () => {
  it('defaults to English when no preference is stored', async () => {
    withCookies({});
    await expect(getRequestLocale()).resolves.toBe('en');
  });

  it('returns the stored supported locale', async () => {
    withCookies({ [LOCALE_COOKIE]: 'ar' });
    await expect(getRequestLocale()).resolves.toBe('ar');
  });

  it('ignores a tampered cookie value', async () => {
    withCookies({ [LOCALE_COOKIE]: '"><script>' });
    await expect(getRequestLocale()).resolves.toBe('en');
  });
});
