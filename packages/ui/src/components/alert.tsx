import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons/icon.js';
import { cn } from '../lib/cn.js';

export type AlertTone = 'info' | 'success' | 'danger' | 'warning';

interface ToneStyle {
  box: string;
  badge: string;
  title: string;
  icon: IconName;
}

function toneStyle(tone: AlertTone): ToneStyle {
  switch (tone) {
    case 'info': // Figma: "Waiting for Sirius HR", "Sirius HR is reviewing".
      return {
        box: 'border-line bg-surface',
        badge: 'bg-brand-600',
        title: 'text-brand-600',
        icon: 'info',
      };
    case 'success': // Figma: "Increment approved".
      return {
        box: 'border-success-600/40 bg-success-50',
        badge: 'bg-success-600',
        title: 'text-success-700',
        icon: 'check',
      };
    case 'danger': // Figma: "Increment rejected".
      return {
        box: 'border-danger-200 bg-danger-50',
        badge: 'bg-danger-600',
        title: 'text-danger-600',
        icon: 'x',
      };
    case 'warning': // Figma: "Needs your action".
      return {
        box: 'border-warning-200 bg-warning-50',
        badge: 'bg-warning-700',
        title: 'text-warning-700',
        icon: 'alert',
      };
  }
}

export interface AlertProps {
  tone?: AlertTone;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** Use "alert" only for errors that need immediate attention; "status" announces politely. */
  role?: 'status' | 'alert' | 'none';
  className?: string;
}

export function Alert({
  tone = 'info',
  title,
  children,
  actions,
  role = 'status',
  className,
}: AlertProps) {
  const style = toneStyle(tone);
  return (
    <div
      role={role === 'none' ? undefined : role}
      data-tone={tone}
      className={cn(
        'flex animate-enter flex-wrap items-center gap-4 rounded-card border px-4 py-3.5',
        style.box,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full text-white',
          style.badge,
        )}
      >
        <Icon name={style.icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', style.title)}>{title}</p>
        {children === undefined ? null : (
          <div className="mt-0.5 text-xs text-ink-muted">{children}</div>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
