import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { LanguageSwitcher } from './language-switcher';

vi.mock('@/app/actions/set-locale', () => ({ setLocale: vi.fn() }));

describe('LanguageSwitcher', () => {
  it('offers every supported language, each labelled in its own script', () => {
    render(<LanguageSwitcher locale="en" t={createTranslator('en')} />);

    const english = screen.getByRole('button', { name: 'Switch language to English' });
    const arabic = screen.getByRole('button', { name: 'Switch language to العربية' });

    expect(english).toHaveAttribute('lang', 'en');
    expect(arabic).toHaveAttribute('lang', 'ar');
    expect(arabic).toHaveTextContent('العربية');
  });

  it('marks the current language as pressed and disabled', () => {
    render(<LanguageSwitcher locale="ar" t={createTranslator('ar')} />);

    const arabic = screen.getByRole('button', { name: /العربية/ });
    const english = screen.getByRole('button', { name: /English/ });

    expect(arabic).toBeDisabled();
    expect(arabic).toHaveAttribute('aria-pressed', 'true');
    expect(english).toBeEnabled();
    expect(english).toHaveAttribute('aria-pressed', 'false');
  });

  it('submits the chosen locale as a form field', () => {
    render(<LanguageSwitcher locale="en" t={createTranslator('en')} />);
    const arabic = screen.getByRole('button', { name: /العربية/ });
    expect(arabic).toHaveAttribute('type', 'submit');
    expect(arabic).toHaveAttribute('name', 'locale');
    expect(arabic).toHaveAttribute('value', 'ar');
  });

  it('labels the button group for assistive technology', () => {
    render(<LanguageSwitcher locale="en" t={createTranslator('en')} />);
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
  });
});
