import { Icon, buttonClasses, cn, focusRing, transition } from '@peopleforge/ui';
import { signOut } from '@/app/sign-in/actions';
import type { Translate } from '@/i18n/translator';

/**
 * A form posting to a Server Action: works without client JavaScript, POST-only (CSRF).
 * `icon`: the sidebar's logout glyph (Figma); `button`: a labelled secondary button.
 */
export function SignOutButton({
  t,
  variant = 'button',
}: {
  t: Translate;
  variant?: 'icon' | 'button';
}) {
  return (
    <form action={signOut}>
      {variant === 'icon' ? (
        <button
          type="submit"
          aria-label={t('account.signOut')}
          title={t('account.signOut')}
          className={cn(
            'flex size-8 items-center justify-center rounded-control text-sidebar-muted hover:bg-white/10 hover:text-white',
            transition,
            focusRing,
          )}
        >
          <Icon name="logout" />
        </button>
      ) : (
        <button type="submit" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
          {t('account.signOut')}
        </button>
      )}
    </form>
  );
}
