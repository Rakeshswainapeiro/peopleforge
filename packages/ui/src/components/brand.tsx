import { cn } from '../lib/cn.js';

/** The PeopleForge shield mark (same drawing as the sign-in screen). Decorative. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn('size-7 shrink-0', className)}
    >
      <path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5l-8-3Z" fill="var(--color-accent)" />
      <circle cx="12" cy="10" r="2.6" fill="none" stroke="#fff" strokeWidth="1.6" />
      <path
        d="M7.8 16.4c.9-1.9 2.4-2.9 4.2-2.9s3.3 1 4.2 2.9"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface WordmarkProps {
  /** "People" */
  lead: string;
  /** "Forge", in the accent colour */
  accent: string;
  /** "HR Management" */
  tagline: string;
}

/** Brand lock-up for the dark sidebar. The product name is not translated. */
export function Wordmark({ lead, accent, tagline }: WordmarkProps) {
  return (
    <div className="flex items-center gap-1.5">
      <BrandMark />
      <div className="flex flex-col">
        <span className="text-xl font-bold leading-tight tracking-tight text-white">
          {lead}
          <span className="text-accent">{accent}</span>
        </span>
        <span className="text-[0.625rem] uppercase tracking-[0.28em] text-sidebar-muted">
          {tagline}
        </span>
      </div>
    </div>
  );
}
