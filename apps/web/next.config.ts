import path from 'node:path';
import type { NextConfig } from 'next';

// CSP is set per request in src/proxy.ts (it needs a fresh nonce); the static headers below
// apply to every response, including static assets the proxy skips.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: trace workspace packages from the repo root so the standalone bundle is complete.
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@sirius-hr/shared-types'],
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default nextConfig;
