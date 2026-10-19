import { getRequestLocale } from '@/i18n/request-locale';
import { extractState } from '@/lib/group-view';
import { fileResponse } from '@/server/download-response';
import { downloadExtract } from '@/server/group-data';

/**
 * RP-08 raw extract (R2-08, R2-14): Excel, CSV or the Palm HR CSV. The API checks
 * `employee_data:extract_raw` and the caller's scope, and records the extraction (R2-13).
 */
export async function GET(request: Request): Promise<Response> {
  const state = extractState(Object.fromEntries(new URL(request.url).searchParams), new Date());
  return fileResponse(
    await downloadExtract({
      format: state.format,
      period: state.period,
      entityId: state.entity,
      allVersions: state.allVersions,
      locale: await getRequestLocale(),
    }),
  );
}
