import { PlainLink, type LinkComponent } from '../lib/link.js';

export interface BreadcrumbItem {
  label: string;
  /** Omitted for the current page (the last item). */
  href?: string | undefined;
}

export interface BreadcrumbProps {
  /** Accessible name of the trail, e.g. "Breadcrumb". */
  label: string;
  items: readonly BreadcrumbItem[];
  as?: LinkComponent;
}

/**
 * Figma page eyebrow "My requests / INC-2026-0152 · Draft": links back up, the last item is
 * the current page (aria-current). Separators are decorative.
 */
export function Breadcrumb({ label, items, as: LinkAs = PlainLink }: BreadcrumbProps) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => (
          <li key={`${String(index)}:${item.label}`} className="flex items-center gap-1">
            {index === 0 ? null : <span aria-hidden="true">/</span>}
            {item.href === undefined ? (
              <span aria-current={index === items.length - 1 ? 'page' : undefined}>
                {item.label}
              </span>
            ) : (
              <LinkAs
                href={item.href}
                className="text-brand-600 underline underline-offset-2 transition-colors hover:text-brand-700"
              >
                {item.label}
              </LinkAs>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
