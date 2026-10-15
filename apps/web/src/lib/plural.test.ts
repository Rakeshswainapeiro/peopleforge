import { describe, expect, it } from 'vitest';
import { pluralForm } from './plural';

describe('pluralForm', () => {
  it('follows the locale’s rules', () => {
    expect(pluralForm(1, 'en')).toBe('one');
    expect(pluralForm(0, 'en')).toBe('other');
    expect(pluralForm(2, 'en')).toBe('other');
    // Arabic's "two" and "few" use the "other" form until translated.
    expect(pluralForm(2, 'ar')).toBe('other');
    expect(pluralForm(1, 'ar')).toBe('one');
  });
});
