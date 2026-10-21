import { NextResponse, type NextRequest } from 'next/server';

/**
 * Strict nonce-based CSP. No third-party origins are allowed: fonts, scripts and styles are
 * all first-party, which also keeps viewer traffic inside the approved hosting region.
 * In development only: `unsafe-eval` (React's dev tooling) and inline styles (the Next.js dev
 * overlay injects <style> tags without the nonce; a nonce would make browsers ignore
 * 'unsafe-inline'). Production keeps nonce-only styles.
 */
/**
 * SHA-256 of `display:none`: React holds streamed chunks of a large page in a hidden container
 * (`<svg style="display:none">`) until they move into place, and a nonce can't cover an
 * attribute. Only that exact declaration is allowed on style attributes.
 */
const STREAMING_HIDDEN = "'sha256-aqNNdDLnnrDOnTNdkJpYlAxKVJtLt9CtFLklmInuUAE='";

export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    ...(isDev ? [] : [`style-src-attr 'unsafe-hashes' ${STREAMING_HIDDEN}`]),
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development');

  // Next.js reads the nonce from the request CSP header and applies it to its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
