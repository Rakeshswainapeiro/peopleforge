import { Card, EmptyState, PageHeader, type IconName } from '@peopleforge/ui';
import type { MessageKey, Translate } from '@/i18n/translator';

interface PlaceholderPageProps {
  t: Translate;
  title: MessageKey;
  body: MessageKey;
  icon: IconName;
}

/** A screen whose slice is not built yet (design §8): says so instead of a blank page. */
export function PlaceholderPage({ t, title, body, icon }: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={t(title)} description={t(body)} />
      <Card className="mt-6">
        <div role="status">
          <EmptyState icon={icon} title={t('home.comingSoon')} />
        </div>
      </Card>
    </>
  );
}
