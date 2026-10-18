import { Button, Field, Input } from '@peopleforge/ui';

export interface AuditFiltersLabels {
  filters: string;
  search: string;
  searchPlaceholder: string;
  from: string;
  to: string;
  apply: string;
}

export interface AuditFiltersProps {
  search: string;
  from: string;
  to: string;
  /** Kept while filtering (one person's actions). */
  actor?: string | undefined;
  labels: AuditFiltersLabels;
}

/** Search and a date range: a plain GET form, so it needs no JavaScript. */
export function AuditFilters({ search, from, to, actor, labels }: AuditFiltersProps) {
  return (
    <form
      method="get"
      action="/audit"
      role="search"
      aria-label={labels.filters}
      className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
    >
      {actor === undefined ? null : <input type="hidden" name="actor" value={actor} />}
      <Field label={labels.search}>
        {(ids) => (
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
          />
        )}
      </Field>
      <Field label={labels.from}>
        {(ids) => (
          <Input
            id={ids.id}
            aria-describedby={ids.describedBy}
            type="date"
            name="from"
            defaultValue={from}
          />
        )}
      </Field>
      <Field label={labels.to}>
        {(ids) => (
          <Input
            id={ids.id}
            aria-describedby={ids.describedBy}
            type="date"
            name="to"
            defaultValue={to}
          />
        )}
      </Field>
      <Button type="submit" variant="secondary">
        {labels.apply}
      </Button>
    </form>
  );
}
