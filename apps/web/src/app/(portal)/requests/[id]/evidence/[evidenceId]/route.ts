import { redirect } from 'next/navigation';
import { z } from 'zod';
import { downloadEvidence } from '@/server/increment-requests';

const Id = z.uuid();

/** Headers of the API's answer that reach the browser; nothing else is passed through. */
const PASSED = ['content-type', 'content-length', 'content-disposition'] as const;

function plain(status: number, text: string): Response {
  return new Response(text, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * Evidence download (R1-04, ADR-010): the API checks the caller may see the file, then this
 * streams it to the browser. Always an attachment, never cached, never sniffed or rendered as a
 * page (sandboxed CSP), so an uploaded file can't run in the portal's origin.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; evidenceId: string }> },
): Promise<Response> {
  const { id, evidenceId } = await params;
  if (!Id.safeParse(id).success || !Id.safeParse(evidenceId).success) {
    return plain(404, 'Not found');
  }
  const result = await downloadEvidence(id, evidenceId);
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
