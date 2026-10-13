'use client';

import { SignInScreen, type SignInScreenProps } from '@sirius/login-ui';
import { useEffect } from 'react';
import { navigateTo } from '@/lib/navigate';
import { startSignIn } from './actions';

type SignInViewProps = Omit<SignInScreenProps, 'onSignIn' | 'onDismissFailure'>;

function clearErrorFromAddressBar(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('error')) return;
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  window.history.replaceState(null, '', url.pathname + url.search);
}

export function SignInView(props: SignInViewProps) {
  // A refresh shouldn't show the same failure again.
  useEffect(clearErrorFromAddressBar, []);

  return (
    <SignInScreen
      {...props}
      onDismissFailure={clearErrorFromAddressBar}
      onSignIn={async () => {
        const result = await startSignIn();
        if (!result.ok) throw new Error('Sign-in could not start');
        navigateTo(result.url);
      }}
    />
  );
}
