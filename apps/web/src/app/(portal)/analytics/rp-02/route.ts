import { getRequestLocale } from '@/i18n/request-locale';
import { rp02Query } from '@/lib/analytics-view';
import { downloadTatReport } from '@/server/analytics';
import { fileResponse } from '@/server/download-response';

/**
 * RP-02 download (R1-11, R1-12, R1-14): the API checks the caller is Sirius HR, builds the file
 * in their language and records the download; this streams it as an attachment.
 */
export async function GET(request: Request): Promise<Response> {
  const query = rp02Query(Object.fromEntries(new URL(request.url).searchParams));
  return fileResponse(await downloadTatReport(query, await getRequestLocale()));
}
