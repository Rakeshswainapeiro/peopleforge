import type { SignInBrand, SignInCopy, SignInHero } from '@sirius/login-ui';
import type { SignInErrorText } from '@sirius/login-ui';
import type { Translate } from '@/i18n/translator';

/**
 * Everything the shared sign-in screen shows for PeopleForge, from messages/*.json so it is
 * translatable. Brand colours and layout come from @sirius/login-ui.
 */
export function signInContent(t: Translate): {
  brand: SignInBrand;
  hero: SignInHero;
  copy: SignInCopy;
} {
  return {
    brand: {
      lead: t('signIn.brand.lead'),
      accent: t('signIn.brand.accent'),
      tagline: t('signIn.brand.tagline'),
      badge: t('signIn.brand.badge'),
    },
    hero: {
      headline: t('signIn.hero.headline'),
      headlineAccent: t('signIn.hero.headlineAccent'),
      description: t('signIn.hero.description'),
      highlights: [
        t('signIn.hero.highlights.incrementRequests'),
        t('signIn.hero.highlights.evidence'),
        t('signIn.hero.highlights.approvals'),
        t('signIn.hero.highlights.employeeData'),
        t('signIn.hero.highlights.anomalyChecks'),
        t('signIn.hero.highlights.groupReports'),
      ],
      features: [
        {
          icon: 'key',
          title: t('signIn.hero.oneSignInTitle'),
          text: t('signIn.hero.oneSignInText'),
        },
        {
          icon: 'shield',
          title: t('signIn.hero.secondCheckTitle'),
          text: t('signIn.hero.secondCheckText'),
        },
        {
          icon: 'users',
          title: t('signIn.hero.roleAccessTitle'),
          text: t('signIn.hero.roleAccessText'),
        },
      ],
      organisation: t('signIn.hero.organisation'),
      notice: t('signIn.hero.notice'),
    },
    copy: {
      heading: t('signIn.heading'),
      subheading: t('signIn.subheading'),
      button: t('signIn.button'),
      buttonBusy: t('signIn.buttonBusy'),
      note: t('signIn.note'),
      unavailable: t('signIn.unavailable'),
      failedHeading: t('signIn.failedHeading'),
      back: t('signIn.back'),
    },
  };
}

/** `?error=` codes: Better Auth's callback codes, plus `session_expired` from this app. */
export function signInErrorText(t: Translate): SignInErrorText {
  return {
    known: {
      unable_to_get_user_info: t('signIn.errors.noAccess'),
      access_denied: t('signIn.errors.cancelled'),
      session_expired: t('signIn.errors.sessionExpired'),
    },
    fallback: t('signIn.errors.fallback'),
    referenceLabel: t('signIn.errors.reference'),
  };
}
