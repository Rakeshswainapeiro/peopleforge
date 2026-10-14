import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/icon.js';
import { cn, variantClass } from '../lib/cn.js';
import { focusRing, transition } from '../lib/focus.js';
import type { LinkComponent } from '../lib/link.js';
import { PlainLink } from '../lib/link.js';
import { Spinner } from './spinner.js';

export type ButtonVariant =
  'primary' | 'secondary' | 'outline' | 'dashed' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS = new Map<ButtonVariant, string>([
  // Figma: "+ New increment request", "Submit to Sirius HR", "Download PDF".
  ['primary', 'bg-brand-600 text-white shadow-card hover:bg-brand-700 active:bg-brand-700'],
  // Figma: "Save draft", "Back to my requests", "Mark all as read", "View".
  [
    'secondary',
    'border border-line-strong bg-surface text-ink shadow-card hover:border-ink-subtle hover:bg-surface-muted',
  ],
  // Figma: "Respond", "Continue draft", "View Status", "+ Add".
  ['outline', 'border border-brand-500 bg-surface text-brand-600 hover:bg-brand-50'],
  // Figma: "Attach File" under a criterion.
  [
    'dashed',
    'border border-dashed border-brand-500 bg-brand-50 text-brand-600 hover:border-brand-600 hover:bg-brand-100',
  ],
  ['ghost', 'text-ink-muted hover:bg-surface-muted hover:text-ink'],
  ['danger', 'bg-danger-600 text-white hover:bg-danger-700'],
  ['success', 'bg-success-600 text-white hover:bg-success-700'],
]);

const SIZES = new Map<ButtonSize, string>([
  ['sm', 'h-8 gap-1.5 px-3 text-xs'],
  ['md', 'h-10 gap-2 px-4 text-sm'],
  ['lg', 'h-12 gap-2 px-5 text-base'],
]);

/** Classes for anything that should look like a button (links included). */
export function buttonClasses(
  options: {
    variant?: ButtonVariant | undefined;
    size?: ButtonSize | undefined;
    fullWidth?: boolean | undefined;
  } = {},
): string {
  const { variant = 'primary', size = 'md', fullWidth = false } = options;
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-control font-semibold',
    'cursor-pointer active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    transition,
    focusRing,
    variantClass(VARIANTS, variant),
    variantClass(SIZES, size),
    fullWidth && 'w-full',
  );
}

interface ContentProps {
  icon?: IconName | undefined;
  /** Icon after the label, e.g. a chevron. */
  trailingIcon?: IconName | undefined;
  children: ReactNode;
}

function ButtonContent({ icon, trailingIcon, children }: ContentProps) {
  return (
    <>
      {icon === undefined ? null : <Icon name={icon} />}
      {children}
      {trailingIcon === undefined ? null : <Icon name={trailingIcon} />}
    </>
  );
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, Omit<ContentProps, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner, keeps the width and blocks repeat clicks (duplicate submissions). */
  loading?: boolean;
  /** Read by screen readers while loading, e.g. "Submitting…". */
  loadingLabel?: string;
}

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  loadingLabel,
  icon,
  trailingIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
    >
      {loading ? (
        <>
          <Spinner label={loadingLabel} />
          {children}
        </>
      ) : (
        <ButtonContent icon={icon} trailingIcon={trailingIcon}>
          {children}
        </ButtonContent>
      )}
    </button>
  );
}

export interface ButtonLinkProps extends Omit<ContentProps, 'children'> {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  as?: LinkComponent;
}

/** A navigation link styled as a button (e.g. "+ New increment request"). */
export function ButtonLink({
  href,
  variant,
  size,
  fullWidth,
  className,
  icon,
  trailingIcon,
  children,
  as: LinkAs = PlainLink,
}: ButtonLinkProps) {
  return (
    <LinkAs href={href} className={cn(buttonClasses({ variant, size, fullWidth }), className)}>
      <ButtonContent icon={icon} trailingIcon={trailingIcon}>
        {children}
      </ButtonContent>
    </LinkAs>
  );
}
