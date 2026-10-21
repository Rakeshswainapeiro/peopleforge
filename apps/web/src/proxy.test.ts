// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCsp, config, proxy } from './proxy';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildCsp', () => {
  it('produces a strict production policy', () => {
    const csp = buildCsp('n0nce', false);
    expect(csp).toContain("script-src 'self' 'nonce-n0nce' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('unsafe-inline');
  });

  it('allows inline styles only in development (dev overlay), never in production', () => {
    expect(buildCsp('n', true)).toContain("style-src 'self' 'unsafe-inline'");
    expect(buildCsp('n', false)).toContain("style-src 'self' 'nonce-n'");
    expect(buildCsp('n', false)).not.toContain('unsafe-inline');
  });

  // React streams a large page in chunks, holding late ones in <svg style="display:none">
  // until they move into place. Exactly that declaration is allowed on style attributes, by
  // hash; any other inline style stays blocked.
  it('lets React’s streaming container hide itself, and nothing else inline', async () => {
    const hash = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode('display:none')),
    ).toString('base64');
    expect(buildCsp('n', false)).toContain(`style-src-attr 'unsafe-hashes' 'sha256-${hash}'`);
    expect(buildCsp('n', true)).not.toContain('style-src-attr');
  });

  it('allows unsafe-eval only in development', () => {
    const csp = buildCsp('n0nce', true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('allows no third-party origins', () => {
    expect(buildCsp('n0nce', false)).not.toMatch(/https?:\/\//);
  });
});

describe('proxy', () => {
  it('sets a CSP with a fresh nonce on every response', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const first = proxy(new NextRequest('https://hr.example.ae/'));
    const second = proxy(new NextRequest('https://hr.example.ae/'));

    const firstCsp = first.headers.get('content-security-policy') ?? '';
    const secondCsp = second.headers.get('content-security-policy') ?? '';

    expect(firstCsp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(firstCsp).not.toBe(secondCsp);
    expect(firstCsp).not.toContain('unsafe-eval');
  });

  it('relaxes eval in development only', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = proxy(new NextRequest('http://localhost:3000/'));
    expect(response.headers.get('content-security-policy')).toContain("'unsafe-eval'");
  });

  it('skips static assets and prefetches', () => {
    const [matcher] = config.matcher;
    expect(matcher?.source).toContain('_next/static');
    expect(matcher?.missing.map((rule) => rule.key)).toEqual(['next-router-prefetch', 'purpose']);
  });
});
