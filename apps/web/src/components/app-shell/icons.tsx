import type { NavIcon } from '@/lib/navigation';

const PATHS: ReadonlyMap<NavIcon, string> = new Map<NavIcon, string>([
  ['home', 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z'],
  ['new-request', 'M12 5v14M5 12h14'],
  ['notifications', 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0'],
  ['reports', 'M4 20V10M10 20V4M16 20v-7M22 20H2'],
]);

/** Decorative: the visible label names the item. None of these are directional (no mirroring). */
export function Icon({ name }: { name: NavIcon }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS.get(name)} />
    </svg>
  );
}
