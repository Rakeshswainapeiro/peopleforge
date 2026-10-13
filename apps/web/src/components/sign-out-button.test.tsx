import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { SignOutButton } from './sign-out-button';

vi.mock('@/app/sign-in/actions', () => ({ signOut: vi.fn() }));

describe('SignOutButton', () => {
  it('is a submit button in a form, so it works without JavaScript', () => {
    render(<SignOutButton t={createTranslator('en')} />);
    const button = screen.getByRole('button', { name: 'Sign out' });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button.closest('form')).not.toBeNull();
  });
});
