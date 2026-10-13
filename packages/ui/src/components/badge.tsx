import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons/icon.js';
import { cn, variantClass } from '../lib/cn.js';

/**
 * Status pills from the Figma tables. Colour is never the only signal (R1-06): every badge has
 * text, and pass/fail badges add an icon.
 */
export type BadgeTone =
  | 'neutral' // Submitted
  | 'outline' // Draft
  | 'info' // Under review, "Status" tag
  | 'info-outline' // Partly approved
  | 'brand' // Approved
  | 'success' // Pass
  | 'danger' // Fail
  | 'danger-solid' // Rejected
  | 'warning'; // Action needed

const TONES = new Map<BadgeTone, string>([
  ['neutral', 'bg-line text-ink'],
  ['outline', 'border border-line-strong bg-surface text-ink'],
  ['info', 'bg-brand-50 text-brand-600'],
  ['info-outline', 'border border-brand-300 bg-brand-50 text-brand-600'],
  ['brand', 'bg-brand-600 text-white'],
  ['success', 'bg-success-50 text-success-600'],
  ['danger', 'bg-danger-50 text-danger-600'],
  ['danger-solid', 'bg-danger-600 text-white'],
  ['warning', 'bg-warning-50 text-warning-700'],
]);

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: IconName | undefined;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClass(TONES, tone),
        className,
      )}
    >
      {icon === undefined ? null : <Icon name={icon} className="size-3" />}
      {children}
    </span>
  );
}
