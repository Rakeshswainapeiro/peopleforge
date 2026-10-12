import { SUPPORTED_LOCALES, type Locale } from '@sirius-hr/shared-types';
import { setLocale } from '@/app/actions/set-locale';
import type { Translate } from '@/i18n/translator';

interface LanguageSwitcherProps {
  locale: Locale;
  t: Translate;
}

/**
 * Plain form posting to a Server Action: works without client JavaScript and is fully
 * keyboard accessible. Each language name is shown in its own script (English / العربية).
 */
export function LanguageSwitcher({ locale, t }: LanguageSwitcherProps) {
  return (
    <form action={setLocale} className="flex items-center gap-2">
      <span id="language-label" className="text-sm text-slate-600">
        {t('locale.label')}
      </span>
      <div role="group" aria-labelledby="language-label" className="flex gap-1">
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
              className="rounded-md border border-slate-300 px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:bg-slate-900 disabled:text-white"
            >
              {name}
            </button>
          );
        })}
      </div>
    </form>
  );
}
