'use client';

import { NavItem, type IconName } from '@peopleforge/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActivePath } from '@/lib/navigation';

export interface NavLinkItem {
  href: string;
  label: string;
  icon: IconName;
  alsoActiveFor?: readonly string[] | undefined;
  /** A count after the label (unread notifications), with its screen-reader text. */
  badge?: { count: number; label: string } | undefined;
}

/** Client component only to read the current path; labels arrive already translated. */
export function NavLinks({ items, label }: { items: readonly NavLinkItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1 lg:flex-col">
        {items.map((item) => (
          <li key={item.href}>
            <NavItem
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActivePath(pathname, item)}
              badge={item.badge?.count}
              badgeLabel={item.badge?.label}
              as={Link}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
