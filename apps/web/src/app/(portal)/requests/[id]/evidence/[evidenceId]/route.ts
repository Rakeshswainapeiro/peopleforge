import { z } from 'zod';
import { downloadEvidence } from '@/server/increment-requests';
import { fileResponse, plain } from '@/server/download-response';

const Id = z.uuid();

/**
 * Evidence download (R1-04, ADR-010): the API checks the caller may see the file, then this
 * streams it to the browser as an attachment (`fileResponse`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; evidenceId: string }> },
): Promise<Response> {
  const { id, evidenceId } = await params;
  if (!Id.safeParse(id).success || !Id.safeParse(evidenceId).success) {
    return plain(404, 'Not found');
  }
  return fileResponse(await downloadEvidence(id, evidenceId));
}
