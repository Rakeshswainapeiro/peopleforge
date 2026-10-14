import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon, type IconName } from '../icons/icon.js';
import { cn } from '../lib/cn.js';
import { focusRing, transition } from '../lib/focus.js';

const control = cn(
  'w-full rounded-control border border-line-strong bg-surface text-sm text-ink shadow-card placeholder:text-ink-subtle',
  'hover:border-ink-subtle focus-visible:border-brand-500',
  'disabled:bg-surface-muted disabled:text-ink-subtle aria-[invalid=true]:border-danger-600',
  transition,
  focusRing,
);

interface FieldIds {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

export interface FieldProps {
  label: ReactNode;
  /** Marks the field required; the asterisk is decorative, `required` on the control is what counts. */
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  /** Visually hide the label (it stays the accessible name), e.g. a search box with a placeholder. */
  hideLabel?: boolean;
  className?: string;
  children: (ids: FieldIds) => ReactNode;
}

/** Label, control, hint and error wired together with ids (WCAG 1.3.1, 3.3.1). */
export function Field({
  label,
  required = false,
  hint,
  error,
  hideLabel = false,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-xs font-medium text-ink', hideLabel && 'sr-only')}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ms-0.5 text-danger-600">
            *
          </span>
        ) : null}
      </label>
      {children({ id, describedBy, invalid: error !== undefined })}
      {hint === undefined ? null : (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} className="text-xs font-medium text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}

export type ControlSize = 'md' | 'lg';

/** md: filters and forms (40px). lg: the Figma table value boxes (48px, larger text). */
function sizeClasses(size: ControlSize): string {
  return size === 'lg' ? 'h-12 text-base' : 'h-10';
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Leading icon inside the box, e.g. search. */
  icon?: IconName | undefined;
  controlSize?: ControlSize;
}

export function Input({ icon, controlSize = 'md', className, ...props }: InputProps) {
  const size = sizeClasses(controlSize);
  if (icon === undefined) {
    return <input {...props} className={cn(control, size, 'px-3', className)} />;
  }
  return (
    <div className="relative">
      <Icon
        name={icon}
        className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
      <input {...props} className={cn(control, size, 'ps-9 pe-3', className)} />
    </div>
  );
}

export function Textarea({
  className,
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      rows={rows}
      className={cn(control, 'min-h-20 resize-y px-3 py-2', className)}
    />
  );
}

/** Native select (keyboard, screen readers and mobile pickers for free) with the Figma chevron. */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  controlSize?: ControlSize;
}

export function Select({ className, children, controlSize = 'md', ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(control, sizeClasses(controlSize), 'appearance-none ps-3 pe-9', className)}
      >
        {children}
      </select>
      <Icon
        name="chevron-down"
        className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
}
