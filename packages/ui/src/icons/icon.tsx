import { cn } from '../lib/cn.js';

/**
 * Outline icons on a 24px grid (Lucide-style strokes, drawn here so no icon library or CDN is
 * needed). Directional icons mirror in right-to-left layouts; the rest never do.
 */
const PATHS = new Map<IconName, string>([
  ['home', 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
  ['file', 'M7 3h7l5 5v13H7zM14 3v5h5M10 12h6M10 16h6'],
  ['bell', 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21a2 2 0 0 0 4 0'],
  ['chart', 'M4 20V10M10 20V4M16 20v-7M2 20h20'],
  ['plus', 'M12 5v14M5 12h14'],
  ['search', 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4'],
  ['check', 'M5 12.5l4.5 4.5L19 7.5'],
  ['x', 'M6 6l12 12M18 6L6 18'],
  ['alert', 'M12 7v6M12 16.5v.5'],
  ['info', 'M12 11v6M12 7.5v.5'],
  ['circle', 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z'],
  [
    'paperclip',
    'M20 11.5l-8.2 8.2a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-8.3 8.3a1.7 1.7 0 0 1-2.3-2.4L14.5 7.7',
  ],
  ['pencil', 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4'],
  ['trash', 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'],
  ['download', 'M12 4v11M7 10l5 5 5-5M5 20h14'],
  ['logout', 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9'],
  ['chevron-down', 'M6 9l6 6 6-6'],
  ['chevron-start', 'M15 6l-6 6 6 6'],
  ['chevron-end', 'M9 6l6 6-6 6'],
  ['chevrons-start', 'M17 6l-6 6 6 6M11 6l-6 6 6 6'],
  ['chevrons-end', 'M7 6l6 6-6 6M13 6l6 6-6 6'],
  ['arrow-start', 'M19 12H5M11 6l-6 6 6 6'],
  ['message', 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5'],
  ['clipboard', 'M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12l2.5 2.5L16 9'],
  ['clock', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2'],
  ['sliders', 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4'],
]);

export type IconName =
  | 'home'
  | 'file'
  | 'bell'
  | 'chart'
  | 'plus'
  | 'search'
  | 'check'
  | 'x'
  | 'alert'
  | 'info'
  | 'circle'
  | 'paperclip'
  | 'pencil'
  | 'trash'
  | 'download'
  | 'logout'
  | 'chevron-down'
  | 'chevron-start'
  | 'chevron-end'
  | 'chevrons-start'
  | 'chevrons-end'
  | 'arrow-start'
  | 'message'
  | 'clipboard'
  | 'clock'
  | 'sliders';

const DIRECTIONAL: ReadonlySet<IconName> = new Set([
  'chevron-start',
  'chevron-end',
  'chevrons-start',
  'chevrons-end',
  'arrow-start',
  'logout',
]);

export interface IconProps {
  name: IconName;
  className?: string;
  /** Accessible name. Omit for decorative icons next to visible text (the default). */
  label?: string;
}

export function Icon({ name, className, label }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      data-icon={name}
      className={cn('size-4 shrink-0', DIRECTIONAL.has(name) && 'rtl:-scale-x-100', className)}
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      <path d={PATHS.get(name)} />
    </svg>
  );
}
