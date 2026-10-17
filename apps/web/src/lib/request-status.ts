import type { LineReviewStatus, RequestStatus } from '@peopleforge/contracts';
import type { BadgeTone } from '@peopleforge/ui';
import type { Translate } from '@/i18n/translator';

export interface StatusBadgeView {
  tone: BadgeTone;
  label: string;
}

/**
 * A request's status as the Figma's pills show it: Draft outlined, Submitted grey, Under review
 * blue, Returned amber, Approved solid brand, Partly approved outlined brand, Rejected solid red.
 * Text always, never colour alone (R1-06).
 */
export function statusBadge(status: RequestStatus, t: Translate): StatusBadgeView {
  switch (status) {
    case 'draft':
      return { tone: 'outline', label: t('requestStatus.draft') };
    case 'submitted':
      return { tone: 'neutral', label: t('requestStatus.submitted') };
    case 'under_review':
      return { tone: 'info', label: t('requestStatus.under_review') };
    case 'returned':
      return { tone: 'warning', label: t('requestStatus.returned') };
    case 'approved':
      return { tone: 'brand', label: t('requestStatus.approved') };
    case 'partly_approved':
      return { tone: 'info-outline', label: t('requestStatus.partly_approved') };
    case 'rejected':
      return { tone: 'danger-solid', label: t('requestStatus.rejected') };
  }
}

/**
 * One employee's status (R1-09). In a draft the employee shares the request's status; once
 * submitted it is the employee's own: waiting for Sirius HR ("To review" for Sirius HR),
 * approved, rejected, or returned to the subsidiary.
 */
export function employeeBadge(
  requestStatus: RequestStatus,
  reviewStatus: LineReviewStatus,
  group: boolean,
  t: Translate,
): StatusBadgeView {
  if (requestStatus === 'draft') return statusBadge(requestStatus, t);
  switch (reviewStatus) {
    case 'pending':
      return group
        ? { tone: 'info', label: t('lineStatus.pendingGroup') }
        : { tone: 'neutral', label: t('lineStatus.pending') };
    case 'approved':
      return { tone: 'brand', label: t('lineStatus.approved') };
    case 'rejected':
      return { tone: 'danger-solid', label: t('lineStatus.rejected') };
    case 'returned':
      return { tone: 'warning', label: t('lineStatus.returned') };
  }
}
