import { useId } from 'react';
import { Icon, type IconName } from '../icons/icon.js';
import { cn } from '../lib/cn.js';
import { transition } from '../lib/focus.js';

export type ChoiceTone = 'neutral' | 'success' | 'danger';

export interface ChoiceOption {
  value: string;
  label: string;
  /** Colour of the chosen segment. Always paired with the label (and an icon if given). */
  tone?: ChoiceTone;
  icon?: IconName;
}

export interface SegmentedChoiceProps {
  /** Form field name. */
  name: string;
  /** Accessible group name, e.g. "Proposed as for Omar Haddad". */
  legend: string;
  options: readonly ChoiceOption[];
  defaultValue?: string | undefined;
  size?: 'sm' | 'md';
  /** The id of the form the radios post with, when the group sits outside it. */
  form?: string | undefined;
  /** Called with the chosen value, e.g. to update a live status before the form is saved. */
  onValueChange?: ((value: string) => void) | undefined;
}

const CHECKED: Record<ChoiceTone, string> = {
  neutral: 'peer-checked:bg-ink peer-checked:text-white',
  success: 'peer-checked:bg-success-600 peer-checked:text-white',
  danger: 'peer-checked:bg-danger-600 peer-checked:text-white',
};

/**
 * A small radio group drawn as joined segments (Figma: "Proposed as  % | AED", "Pass | Fail"):
 * the chosen segment fills its half edge to edge, a hairline separates the others. Native
 * radios, so it works without JavaScript, posts with the form and is operated with arrow keys.
 * Hover only tints segments that aren't chosen: white text stays on a dark fill.
 */
export function SegmentedChoice({
  name,
  legend,
  options,
  defaultValue,
  size = 'sm',
  form,
  onValueChange,
}: SegmentedChoiceProps) {
  const id = useId();
  return (
    <fieldset className="inline-flex">
      <legend className="sr-only">{legend}</legend>
      <div className="inline-flex overflow-hidden rounded-control border border-line-strong bg-surface shadow-card">
        {options.map((option, index) => (
          <label
            key={option.value}
            htmlFor={`${id}-${option.value}`}
            className={cn('relative', index > 0 && 'border-s border-line-strong')}
          >
            <input
              id={`${id}-${option.value}`}
              type="radio"
              name={name}
              value={option.value}
              form={form}
              defaultChecked={option.value === defaultValue}
              onChange={() => onValueChange?.(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex cursor-pointer items-center justify-center gap-1.5 font-medium text-ink',
                size === 'sm' ? 'h-8 min-w-10 px-2.5 text-xs' : 'h-8 min-w-14 px-3.5 text-sm',
                'peer-[:not(:checked)]:hover:bg-surface-muted',
                CHECKED[option.tone ?? 'neutral'],
                // Inside the frame: the group clips its children, so the ring is drawn inset.
                'peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-brand-500',
                transition,
              )}
            >
              {option.icon === undefined ? null : <Icon name={option.icon} className="size-4" />}
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
