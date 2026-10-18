import { getRequestLocale } from '@/i18n/request-locale';
import { reportQuery } from '@/lib/report-view';
import { fileResponse, plain } from '@/server/download-response';
import { downloadIncrementReport } from '@/server/increment-requests';

/**
 * RP-01 download (R1-14): the API checks the caller's permissions and scope, builds the file in
 * their language and records the download (R1-15); this streams it as an attachment.
 */
export async function GET(request: Request): Promise<Response> {
  const parsed = reportQuery(Object.fromEntries(new URL(request.url).searchParams));
  if (parsed === null) return plain(400, 'Bad request');
  const locale = await getRequestLocale();
  return fileResponse(
    await downloadIncrementReport({ ...parsed.filter, format: parsed.format, locale }),
  );
}
