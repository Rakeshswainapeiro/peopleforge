import { MAX_EVIDENCE_FILE_MB } from '@peopleforge/contracts';
import path from 'node:path';
import type { NextConfig } from 'next';

// An evidence upload passes through the proxy and a Server Action as multipart: the file's
// limit plus 1 MB for the form fields and boundaries. The API enforces the real limit.
const uploadBodyLimit = `${String(MAX_EVIDENCE_FILE_MB + 1)}mb` as const;

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
  // The dev-tools badge is injected after the page and makes full-height screens scroll in
  // development only; errors still show in the overlay.
  devIndicators: false,
  transpilePackages: ['@sirius/shared-types'],
  experimental: {
    serverActions: { bodySizeLimit: uploadBodyLimit },
    proxyClientMaxBodySize: uploadBodyLimit,
  },
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default nextConfig;
