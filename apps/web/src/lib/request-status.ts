import type { RequestStatus } from '@peopleforge/contracts';
import type { BadgeTone } from '@peopleforge/ui';
import type { Translate } from '@/i18n/translator';

export interface StatusBadgeView {
  tone: BadgeTone;
  label: string;
}

/**
 * A request's (or employee's) status as the Figma's pills show it: Draft outlined, Submitted
 * grey. Approved, Rejected and the review statuses join with S5. Text always, never colour alone.
 */
export function statusBadge(status: RequestStatus, t: Translate): StatusBadgeView {
  switch (status) {
    case 'draft':
      return { tone: 'outline', label: t('requestStatus.draft') };
    case 'submitted':
      return { tone: 'neutral', label: t('requestStatus.submitted') };
  }
}
