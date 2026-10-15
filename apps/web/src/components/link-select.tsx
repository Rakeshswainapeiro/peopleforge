'use client';

import { Select } from '@peopleforge/ui';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export interface LinkSelectOption {
  value: string;
  label: string;
  href: string;
}

export interface LinkSelectProps {
  label: string;
  value: string;
  options: readonly LinkSelectOption[];
}

/** A small select whose choices are links, e.g. "Rows per page": choosing one navigates. */
export function LinkSelect({ label, value, options }: LinkSelectProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2 text-xs text-ink-muted">
      {label}
      <Select
        controlSize="sm"
        value={value}
        aria-busy={pending || undefined}
        onChange={(event) => {
          const chosen = options.find((option) => option.value === event.currentTarget.value);
          if (chosen === undefined) return;
          startTransition(() => {
            router.push(chosen.href, { scroll: false });
          });
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
