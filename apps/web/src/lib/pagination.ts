import type { PaginationLabels } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import type { Translate } from '@/i18n/translator';

/** The lists with their own pagination wording (each names what it pages). */
export type PaginatedList = 'notifications' | 'dashboard';

/** How many pages `total` items fill (at least one, so "Page 1 of 1" for an empty list). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** The Pagination component's labels, in the reader's language and digits. */
export function paginationLabels(
  list: PaginatedList,
  page: number,
  pages: number,
  locale: Locale,
  t: Translate,
): PaginationLabels {
  const number = new Intl.NumberFormat(locale);
  return {
    navigation: t(`${list}.pagination.navigation`),
    pageOf: t(`${list}.pagination.pageOf`, {
      page: number.format(page),
      pages: number.format(pages),
    }),
    first: t(`${list}.pagination.first`),
    previous: t(`${list}.pagination.previous`),
    next: t(`${list}.pagination.next`),
    last: t(`${list}.pagination.last`),
  };
}
