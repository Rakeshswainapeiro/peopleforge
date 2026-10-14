import { useId } from 'react';
import { cn } from '../lib/cn.js';
import { transition } from '../lib/focus.js';

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface SegmentedChoiceProps {
  /** Form field name. */
  name: string;
  /** Accessible group name, e.g. "Proposed as for Omar Haddad". */
  legend: string;
  options: readonly ChoiceOption[];
  defaultValue?: string | undefined;
  size?: 'sm' | 'md';
}

/**
 * A small radio group drawn as joined segments (Figma: "Proposed as  % | AED"). Native radios,
 * so it works without JavaScript, posts with the form and is operated with arrow keys.
 */
export function SegmentedChoice({
  name,
  legend,
  options,
  defaultValue,
  size = 'sm',
}: SegmentedChoiceProps) {
  const id = useId();
  return (
    <fieldset className="inline-flex">
      <legend className="sr-only">{legend}</legend>
      <div className="inline-flex rounded-control border border-line-strong bg-surface p-0.5">
        {options.map((option) => (
          <label key={option.value} htmlFor={`${id}-${option.value}`} className="relative">
            <input
              id={`${id}-${option.value}`}
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={option.value === defaultValue}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex items-center justify-center rounded-[calc(var(--radius-control)-2px)] font-medium text-ink',
                size === 'sm' ? 'h-7 min-w-9 px-2 text-xs' : 'h-9 min-w-12 px-3 text-sm',
                'peer-[:not(:checked)]:hover:bg-surface-muted peer-checked:bg-ink peer-checked:text-white',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500',
                transition,
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
