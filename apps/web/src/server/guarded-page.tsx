import type { Permission } from '@peopleforge/contracts';
import type { IconName } from '@peopleforge/ui';
import { notFound } from 'next/navigation';
import { PlaceholderPage } from '@/components/placeholder-page';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator, type MessageKey } from '@/i18n/translator';
import { hasAnyPermission } from '@/lib/navigation';
import { requireViewer } from './session';

/**
 * A placeholder portal page behind a permission. Without it the page answers 404 (as if absent),
 * matching the API's deny-by-default; the API re-checks on every call anyway.
 */
export async function guardedPlaceholder(
  anyOf: readonly Permission[] | undefined,
  title: MessageKey,
  body: MessageKey,
  icon: IconName,
) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!hasAnyPermission(me.permissions, anyOf)) notFound();
  return (
    <PlaceholderPage
      t={createTranslator(await getRequestLocale())}
      title={title}
      body={body}
      icon={icon}
    />
  );
}
