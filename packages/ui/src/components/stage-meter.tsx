import { cn } from '../lib/cn.js';

export interface StageMeterProps {
  /** Segments reached, e.g. 1 for "Criterion 1 of 5"; 0 before review. */
  filled: number;
  /** All segments, e.g. the request's criteria count. */
  total: number;
  /** What the segments mean, shown beside them: "Criterion 1 of 5", "Not submitted". */
  label: string;
}

/**
 * Figma "Review stage": a short bar of segments with the stage written next to it. The bar is
 * decoration; the text carries the meaning (never colour or length alone, R1-06).
 */
export function StageMeter({ filled, total, label }: StageMeterProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" data-filled={filled} className="flex gap-0.5">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-1.5 w-3 rounded-full',
              index < filled ? 'bg-brand-600' : 'bg-line-strong',
            )}
          />
        ))}
      </span>
      <span className="whitespace-nowrap text-xs text-ink">{label}</span>
    </span>
  );
}
