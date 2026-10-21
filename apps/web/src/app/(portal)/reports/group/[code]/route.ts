import { getRequestLocale } from '@/i18n/request-locale';
import { groupReportQuery } from '@/lib/report-view';
import { fileResponse, plain } from '@/server/download-response';
import { downloadGroupReport } from '@/server/group-data';

interface Context {
  params: Promise<{ code: string }>;
}

/**
 * RP-03 … RP-07 downloads (R2-06, R2-07): the API checks the caller's permission and scope,
 * builds the file in their language and records the download (R2-13); this streams it.
 */
export async function GET(request: Request, { params }: Context): Promise<Response> {
  const query = groupReportQuery(
    (await params).code,
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (query === null) return plain(400, 'Bad request');
  return fileResponse(await downloadGroupReport({ ...query, locale: await getRequestLocale() }));
}
