import type { Me } from '@peopleforge/contracts';
import { Avatar, Wordmark } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SignOutButton } from '@/components/sign-out-button';
import type { Translate } from '@/i18n/translator';
import { visibleNavItems } from '@/lib/navigation';
import { displayName, entityName, roleLabel } from '@/lib/viewer-display';
import { NavLinks } from './nav-links';

interface SidebarProps {
  me: Me;
  locale: Locale;
  t: Translate;
  /** Unread notifications for the bell; 0 when unknown (the API being down hides nothing else). */
  unread: number;
}

/** Second line under the name: role, then the subsidiary (or "All subsidiaries" for Sirius). */
export function scopeText(me: Me, locale: Locale, t: Translate): string {
  if (me.scope === 'group') return t('shell.allEntities');
  if (me.entities.length === 0) return t('shell.noEntities');
  return me.entities.map((entity) => entityName(entity, locale)).join(', ');
}

/**
 * Portal sidebar (Figma: dark rail): wordmark, navigation filtered by permission, language
 * switch and the signed-in user with sign-out. Below 1024px it becomes a header bar.
 */
export function Sidebar({ me, locale, t, unread }: SidebarProps) {
  const name = displayName(me);
  const items = visibleNavItems(me.permissions).map((item) => ({
    href: item.href,
    icon: item.icon,
    label: t(item.label),
    alsoActiveFor: item.alsoActiveFor,
    badge:
      item.showsUnread === true
        ? {
            count: unread,
            label: t('notifications.unreadCount', {
              count: new Intl.NumberFormat(locale).format(unread),
            }),
          }
        : undefined,
  }));
  return (
    <aside className="flex flex-col gap-6 bg-sidebar px-3 py-4 text-sidebar-ink lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:py-5">
      <div className="px-2">
        <Wordmark
          lead={t('signIn.brand.lead')}
          accent={t('signIn.brand.accent')}
          tagline={t('signIn.brand.tagline')}
        />
      </div>
      <NavLinks items={items} label={t('nav.main')} />
      <div className="flex flex-col gap-4 lg:mt-auto">
        <div className="px-2">
          <LanguageSwitcher locale={locale} t={t} tone="dark" />
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 px-2 pt-4">
          <Avatar name={name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white" data-testid="viewer-name">
              <span className="sr-only">{t('account.signedInAs', { name })}</span>
              <span aria-hidden="true">{name}</span>
            </p>
            <p className="line-clamp-2 text-xs text-sidebar-muted">
              {t(roleLabel(me.roles))} · {scopeText(me, locale, t)}
            </p>
          </div>
          <SignOutButton t={t} variant="icon" />
        </div>
      </div>
    </aside>
  );
}
