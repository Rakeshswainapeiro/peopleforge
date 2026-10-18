import { redirect } from 'next/navigation';
import type { DownloadResult } from './api-client';

/** Headers of the API's answer that reach the browser; nothing else is passed through. */
const PASSED = ['content-type', 'content-length', 'content-disposition'] as const;

/** A short plain-text answer (404, 503), never cached. */
export function plain(status: number, text: string): Response {
  return new Response(text, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * A file from the API streamed to the browser (evidence, reports): always an attachment, never
 * cached, never sniffed or rendered as a page (sandboxed CSP), so a file can't run in the
 * portal's origin. A dead session goes to "Session ended".
 */
export function fileResponse(result: DownloadResult): Response {
  switch (result.kind) {
    case 'ok': {
      const headers = new Headers({
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      });
      for (const name of PASSED) {
        const value = result.response.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      return new Response(result.response.body, { status: 200, headers });
    }
    case 'unauthenticated':
      return redirect('/session-ended');
    case 'not_found':
      return plain(404, 'Not found');
    case 'unavailable':
      return plain(503, 'Temporarily unavailable');
  }
}
