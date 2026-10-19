import { z } from 'zod';
import { fileResponse, plain } from '@/server/download-response';
import { downloadUploadFile } from '@/server/group-data';

interface Context {
  params: Promise<{ id: string }>;
}

/** The file as uploaded (R2-08); the API checks access and records the download (R2-13). */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return plain(404, 'Not found');
  return fileResponse(await downloadUploadFile(id.data));
}
