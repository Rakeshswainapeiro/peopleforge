import { cn, focusRing, transition } from '@peopleforge/ui';
import { SUPPORTED_LOCALES, type Locale } from '@sirius/shared-types';
import { setLocale } from '@/app/actions/set-locale';
import type { Translate } from '@/i18n/translator';

interface LanguageSwitcherProps {
  locale: Locale;
  t: Translate;
  /** `dark` for the sidebar, `light` on white surfaces. */
  tone?: 'light' | 'dark';
}

/**
 * Plain form posting to a Server Action: works without client JavaScript and is fully
 * keyboard accessible. Each language name is shown in its own script (English / العربية).
 */
export function LanguageSwitcher({ locale, t, tone = 'light' }: LanguageSwitcherProps) {
  const dark = tone === 'dark';
  return (
    <form action={setLocale} className="flex items-center gap-2">
      <span
        id="language-label"
        className={cn('text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}
      >
        {t('locale.label')}
      </span>
      <div
        role="group"
        aria-labelledby="language-label"
        className={cn(
          'flex rounded-control border p-0.5',
          dark ? 'border-white/15' : 'border-line-strong bg-surface',
        )}
      >
        {SUPPORTED_LOCALES.map((option) => {
          const name = t(`locale.${option}`);
          const isCurrent = option === locale;
          return (
            <button
              key={option}
              type="submit"
              name="locale"
              value={option}
              lang={option}
              disabled={isCurrent}
              aria-pressed={isCurrent}
              aria-label={t('locale.switchTo', { language: name })}
              className={cn(
                'rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 text-xs font-medium disabled:cursor-default',
                dark
                  ? 'text-sidebar-ink hover:bg-white/10 disabled:bg-white disabled:text-sidebar'
                  : 'text-ink hover:bg-surface-muted disabled:bg-ink disabled:text-white',
                transition,
                focusRing,
              )}
            >
              {name}
            </button>
          );
        })}
      </div>
    </form>
  );
}
