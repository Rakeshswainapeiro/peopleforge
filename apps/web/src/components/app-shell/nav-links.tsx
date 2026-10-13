'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActivePath, type NavIcon } from '@/lib/navigation';
import { Icon } from './icons';

export interface NavLinkItem {
  href: string;
  label: string;
  icon: NavIcon;
}

/** Client component only to read the current path; labels arrive already translated. */
export function NavLinks({ items, label }: { items: readonly NavLinkItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1 lg:flex-col">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
