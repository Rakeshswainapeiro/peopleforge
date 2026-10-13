import { signOut } from '@/app/sign-in/actions';
import type { Translate } from '@/i18n/translator';

/** A form posting to a Server Action: works without client JavaScript, POST-only (CSRF). */
export function SignOutButton({ t }: { t: Translate }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="rounded-md border border-slate-300 px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
      >
        {t('account.signOut')}
      </button>
    </form>
  );
}
