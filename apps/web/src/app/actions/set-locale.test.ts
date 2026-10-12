import { cookies } from 'next/headers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeCookieStore } from '@/test-support/next-headers';
import { setLocale } from './set-locale';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

function form(locale: string | null): FormData {
  const data = new FormData();
  if (locale !== null) data.set('locale', locale);
  return data;
}

function mockStore() {
  const store = fakeCookieStore();
  vi.mocked(cookies).mockResolvedValue(store as unknown as Awaited<ReturnType<typeof cookies>>);
  return store;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('setLocale', () => {
  it('stores a supported locale in an HttpOnly, SameSite=Lax cookie', async () => {
    const store = mockStore();
    await setLocale(form('ar'));
    expect(store.set).toHaveBeenCalledWith(
      'locale',
      'ar',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 31_536_000 }),
    );
  });

  it('marks the cookie Secure in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const store = mockStore();
    await setLocale(form('en'));
    expect(store.set).toHaveBeenCalledWith(
      'locale',
      'en',
      expect.objectContaining({ secure: true }),
    );
  });

  it('does not mark the cookie Secure outside production so local http works', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const store = mockStore();
    await setLocale(form('en'));
    expect(store.set).toHaveBeenCalledWith(
      'locale',
      'en',
      expect.objectContaining({ secure: false }),
    );
  });

  it.each([null, 'fr', 'ar; Path=/admin', ''])('ignores unsupported value %j', async (value) => {
    const store = mockStore();
    await setLocale(form(value));
    expect(store.set).not.toHaveBeenCalled();
  });
});
