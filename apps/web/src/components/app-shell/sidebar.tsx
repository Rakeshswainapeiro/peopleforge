import type { Me } from '@peopleforge/access';
import type { Locale } from '@sirius/shared-types';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SignOutButton } from '@/components/sign-out-button';
import type { Translate } from '@/i18n/translator';
import { visibleNavItems } from '@/lib/navigation';
import { displayName, entityName, initials, roleLabel } from '@/lib/viewer-display';
import { NavLinks } from './nav-links';

interface SidebarProps {
  me: Me;
  locale: Locale;
  t: Translate;
}

/** Second line under the name: role, then the subsidiary (or "All subsidiaries" for Sirius). */
function scopeText(me: Me, locale: Locale, t: Translate): string {
  if (me.scope === 'group') return t('shell.allEntities');
  if (me.entities.length === 0) return t('shell.noEntities');
  return me.entities.map((entity) => entityName(entity, locale)).join(', ');
}

/**
 * Portal sidebar (design: app shell): brand, navigation filtered by permission, language
 * switcher and the signed-in user. On narrow screens it becomes a header above the content.
 */
export function Sidebar({ me, locale, t }: SidebarProps) {
  const name = displayName(me);
  const items = visibleNavItems(me.permissions).map((item) => ({
    href: item.href,
    icon: item.icon,
    label: t(item.label),
  }));
  return (
    <aside className="flex flex-col gap-6 bg-slate-950 p-4 text-white lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:shrink-0">
      <p className="px-3 pt-2 text-xl font-bold tracking-tight">
        <span>{t('signIn.brand.lead')}</span>
        <span className="text-emerald-400">{t('signIn.brand.accent')}</span>
      </p>
      <NavLinks items={items} label={t('nav.main')} />
      <div className="flex flex-col gap-4 lg:mt-auto">
        <div className="[&_span]:text-slate-300 [&_button]:border-slate-600 [&_button]:text-white">
          <LanguageSwitcher locale={locale} t={t} />
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 pt-4">
          <span
            aria-hidden="true"
            data-testid="viewer-avatar"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold"
          >
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" data-testid="viewer-name">
              {t('account.signedInAs', { name })}
            </p>
            <p className="truncate text-xs text-slate-400">
              {t(roleLabel(me.roles))} · {scopeText(me, locale, t)}
            </p>
          </div>
        </div>
        <div className="[&_button]:w-full [&_button]:border-slate-600 [&_button]:text-white">
          <SignOutButton t={t} />
        </div>
      </div>
    </aside>
  );
}
