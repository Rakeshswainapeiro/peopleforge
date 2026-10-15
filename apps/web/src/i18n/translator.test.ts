import { describe, expect, it } from 'vitest';
import { createTranslator, missingKeys, unknownKeys, type MessageKey } from './translator';

describe('createTranslator', () => {
  it('returns English text', () => {
    expect(createTranslator('en')('app.name')).toBe('PeopleForge');
  });

  it('returns Arabic text where a translation exists', () => {
    expect(createTranslator('ar')('locale.label')).toBe('اللغة');
  });

  it('falls back to English for keys not yet translated', () => {
    expect(createTranslator('ar')('states.retry')).toBe('Try again');
  });

  it('falls back to the key itself rather than throwing', () => {
    const t = createTranslator('en');
    expect(t('does.not.exist' as MessageKey)).toBe('does.not.exist');
  });

  it('interpolates string and numeric parameters', () => {
    const t = createTranslator('en');
    expect(t('locale.switchTo', { language: 'العربية' })).toBe('Switch language to العربية');
    expect(t('states.errorBody', { reference: 42 })).toContain('reference 42');
  });

  it('leaves unknown placeholders visible so missing params are caught in review', () => {
    expect(createTranslator('en')('locale.switchTo', {})).toBe('Switch language to {language}');
  });

  it('does not interpret parameter values as templates', () => {
    const t = createTranslator('en');
    expect(t('locale.switchTo', { language: '{language}<script>' })).toBe(
      'Switch language to {language}<script>',
    );
  });
});

describe('catalogue integrity', () => {
  it('has no Arabic keys that are missing from English', () => {
    expect(unknownKeys('ar')).toEqual([]);
  });

  it('reports untranslated Arabic keys without failing (Arabic is a scaffold)', () => {
    const missing = missingKeys('ar');
    expect(missing).toContain('states.retry');
    expect(missing).not.toContain('locale.label');
  });

  it('has every English key translated into English', () => {
    expect(missingKeys('en')).toEqual([]);
    expect(unknownKeys('en')).toEqual([]);
  });
});
