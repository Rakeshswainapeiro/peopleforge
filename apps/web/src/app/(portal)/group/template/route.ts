import { getRequestLocale } from '@/i18n/request-locale';
import { fileResponse } from '@/server/download-response';
import { downloadTemplate } from '@/server/group-data';

/** The field template as Excel (R2-01), in the reader's language, from the API. */
export async function GET(): Promise<Response> {
  return fileResponse(await downloadTemplate(await getRequestLocale()));
}
