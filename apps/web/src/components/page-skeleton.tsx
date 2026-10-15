import { Skeleton } from '@peopleforge/ui';

/**
 * The shape of a portal page (eyebrow, title, description, then cards) while the server renders
 * it. It fades in after a short delay, so quick navigations don't flash a skeleton; the loading
 * message is announced politely to screen readers.
 */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="animate-enter [animation-delay:120ms]">
      <p role="status" aria-live="polite" className="sr-only">
        {label}
      </p>
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-3 h-7 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-6 border-t border-line pt-6">
        <Skeleton className="h-16 rounded-card" />
        <Skeleton className="mt-6 h-64 rounded-card" />
      </div>
    </div>
  );
}
