import { z } from 'zod';
import { getRequestLocale } from '@/i18n/request-locale';
import { fileResponse, plain } from '@/server/download-response';
import { downloadUploadIssues } from '@/server/group-data';

interface Context {
  params: Promise<{ id: string }>;
}

/** An upload's problem report (R2-01): every problem by row and column, as Excel. */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return plain(404, 'Not found');
  return fileResponse(await downloadUploadIssues(id.data, await getRequestLocale()));
}
