import type { IncrementRequest } from '@peopleforge/contracts';
import { Card, CardHeader, ProgressSteps } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import type { Translate } from '@/i18n/translator';
import { progressSteps } from '@/lib/request-view';

/** Figma "Progress" card: Added → Submitted → Review → Decision (request and employee pages). */
export function RequestProgress({
  request,
  locale,
  t,
}: {
  request: IncrementRequest;
  locale: Locale;
  t: Translate;
}) {
  return (
    <Card className="mt-6" label={t('request.progress')}>
      <CardHeader title={t('request.progress')} />
      <div className="px-6 pt-4 pb-6">
        <ProgressSteps
          label={t('request.progress')}
          steps={progressSteps(request, locale, t)}
          stateLabels={{
            done: t('request.progressStates.done'),
            current: t('request.progressStates.current'),
            todo: t('request.progressStates.todo'),
          }}
        />
      </div>
    </Card>
  );
}
