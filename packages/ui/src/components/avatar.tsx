import { cn } from '../lib/cn.js';

/**
 * Up to two initials: first and last word, whole grapheme clusters, so Arabic and accented
 * names work. No photo is fetched (design §7: no data sent to Graph until agreed).
 */
export function initials(name: string): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const firstGrapheme = (word: string) =>
    Array.from(segmenter.segment(word), (part) => part.segment).slice(0, 1);
  const words = name.normalize('NFC').trim().split(/\s+/u).filter(Boolean);
  const firstAndLast = words.filter((_, index) => index === 0 || index === words.length - 1);
  return firstAndLast.flatMap(firstGrapheme).join('').toLocaleUpperCase();
}

/** Decorative: the person's name is always shown next to it. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="avatar"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-control bg-accent text-sm font-semibold text-sidebar',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
