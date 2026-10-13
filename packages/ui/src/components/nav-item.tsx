import { Icon, type IconName } from '../icons/icon.js';
import { cn } from '../lib/cn.js';
import { transition } from '../lib/focus.js';
import { PlainLink, type LinkComponent } from '../lib/link.js';

export interface NavItemProps {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
  as?: LinkComponent;
}

/** Sidebar entry. Figma: the current page is a white pill with dark text. */
export function NavItem({ href, label, icon, active, as: LinkAs = PlainLink }: NavItemProps) {
  return (
    <LinkAs
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        active
          ? 'bg-white text-sidebar shadow-card'
          : 'text-sidebar-ink hover:bg-white/10 hover:text-white',
        transition,
      )}
    >
      <Icon name={icon} />
      {label}
    </LinkAs>
  );
}
