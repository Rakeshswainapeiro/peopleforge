import '@sirius/login-ui/styles.css';
import { resolveSignInError } from '@sirius/login-ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { currentSession } from '@/server/session';
import { signInContent, signInErrorText } from './content';
import { SignInView } from './sign-in-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getRequestLocale());
  return { title: `${t('signIn.pageTitle')} · ${t('app.name')}` };
}

interface SignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Organisation sign-in (ADR-003). Signed-in visitors go straight to the app. */
export default async function SignInPage({ searchParams }: SignInPageProps) {
  if ((await currentSession()) !== null) redirect('/');

  const t = createTranslator(await getRequestLocale());
  const { error } = await searchParams;
  const failure = resolveSignInError(typeof error === 'string' ? error : null, signInErrorText(t));

  return <SignInView {...signInContent(t)} failure={failure} />;
}
