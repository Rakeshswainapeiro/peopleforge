'use client';

import { cn, Field, Input, Select, Spinner } from '@peopleforge/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition, type SyntheticEvent } from 'react';

export interface FilterOption {
  value: string;
  label: string;
}

export interface DashboardFiltersLabels {
  filters: string;
  search: string;
  searchPlaceholder: string;
  applySearch: string;
}

/** A drop-down filter: its URL parameter, label, current value and choices. */
export interface FilterSelect {
  name: string;
  label: string;
  value: string;
  options: readonly FilterOption[];
}

export interface DashboardFiltersProps {
  /** The page the filters apply to ("/" or "/review"). */
  path?: string;
  /** Values carried over from the URL that the filters don't change (view, request, size). */
  hidden: Readonly<Record<string, string>>;
  search: string;
  /** Period, Status, Subsidiary…: in this order after the search box. */
  selects: readonly FilterSelect[];
  labels: DashboardFiltersLabels;
}

/** How long typing pauses before the list follows the search box. */
export const SEARCH_DELAY_MS = 350;

/** The form's values as a link to its page: empty values dropped, back to page 1. */
export function filtersHref(form: HTMLFormElement, path = '/'): string {
  const query = new URLSearchParams();
  for (const [name, value] of new FormData(form)) {
    if (typeof value === 'string' && value.trim() !== '') query.set(name, value.trim());
  }
  const search = query.toString();
  return search === '' ? path : `${path}?${search}`;
}

const COLUMNS = new Map<number, string>([
  [0, 'md:grid-cols-1'],
  [1, 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'],
  [2, 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]'],
  [3, 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]'],
]);

/**
 * Figma "Search · Period · Status". A plain GET form, so it works without JavaScript (Enter
 * applies it); with JavaScript, choosing a period or status applies at once and the list follows
 * the search box as you type, replacing the URL so Back isn't flooded with keystrokes.
 */
export function DashboardFilters({
  path = '/',
  hidden,
  search,
  selects,
  labels,
}: DashboardFiltersProps) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pending, startTransition] = useTransition();

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const apply = (target: HTMLFormElement) => {
    clearTimeout(timer.current);
    const href = filtersHref(target, path);
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  };

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply(event.currentTarget);
  };

  return (
    <form
      method="get"
      action={path}
      role="search"
      aria-label={labels.filters}
      aria-busy={pending || undefined}
      onSubmit={onSubmit}
      className={cn('grid gap-4', COLUMNS.get(Math.min(selects.length, 3)))}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Field label={labels.search}>
        {(ids) => (
          <div className="relative">
            <Input
              id={ids.id}
              aria-describedby={ids.describedBy}
              type="search"
              name="q"
              icon="search"
              defaultValue={search}
              placeholder={labels.searchPlaceholder}
              autoComplete="off"
              maxLength={100}
              onChange={(event) => {
                const target = event.currentTarget.form;
                clearTimeout(timer.current);
                timer.current = setTimeout(() => {
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- an <input> inside this <form> always has it
                  apply(target!);
                }, SEARCH_DELAY_MS);
              }}
            />
            {pending ? (
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-muted">
                <Spinner />
              </span>
            ) : null}
          </div>
        )}
      </Field>
      {selects.map((select) => (
        <Field key={select.name} label={select.label}>
          {(ids) => (
            <Select
              id={ids.id}
              aria-describedby={ids.describedBy}
              name={select.name}
              defaultValue={select.value}
              onChange={(event) => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- see above
                apply(event.currentTarget.form!);
              }}
            >
              {select.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ))}
      {/* Without JavaScript, Enter in the search box applies the filters; visible on focus. */}
      <button
        type="submit"
        className="sr-only focus:not-sr-only focus:rounded-control focus:px-3 focus:py-2 focus:text-sm"
      >
        {labels.applySearch}
      </button>
    </form>
  );
}
