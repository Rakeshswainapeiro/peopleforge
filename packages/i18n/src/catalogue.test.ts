import { describe, expect, it } from 'vitest';
import { createCatalogues, flattenMessages, interpolate, pluralForm } from './catalogue.js';

const catalogues = createCatalogues({
  en: { app: { name: 'PeopleForge' }, hello: 'Hello {name}', only: { en: 'English only' } },
  ar: { app: { name: 'بيبول فورج' }, extra: 'not in English' },
});

describe('createCatalogues', () => {
  it('translates, falling back to English and then to the key', () => {
    expect(catalogues.translator('en')('app.name')).toBe('PeopleForge');
    expect(catalogues.translator('ar')('app.name')).toBe('بيبول فورج');
    expect(catalogues.translator('ar')('only.en')).toBe('English only');
    expect(catalogues.translator('en')('does.not.exist')).toBe('does.not.exist');
    expect(catalogues.translator('ar')('hello', { name: 'Priya' })).toBe('Hello Priya');
  });

  it('reports keys only one side has', () => {
    expect(catalogues.unknownKeys('ar')).toEqual(['extra']);
    expect(catalogues.missingKeys('ar')).toEqual(['hello', 'only.en']);
    expect(catalogues.missingKeys('en')).toEqual([]);
  });

  it('treats a locale without a file as untranslated', () => {
    const englishOnly = createCatalogues({ en: { a: 'A' } } as never);
    expect(englishOnly.translator('ar')('a')).toBe('A');
    expect(englishOnly.missingKeys('ar')).toEqual(['a']);
  });
});

describe('flattenMessages', () => {
  it('flattens nested objects into dotted keys', () => {
    expect([...flattenMessages({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })]).toEqual([
      ['a.b', 'x'],
      ['a.c.d', 'y'],
      ['e', 'z'],
    ]);
  });

  it.each([null, 'text', 42])('returns nothing for %j', (input) => {
    expect(flattenMessages(input).size).toBe(0);
  });
});

describe('interpolate', () => {
  it('fills placeholders, keeps unknown ones, and never re-reads values as templates', () => {
    expect(interpolate('Hi {a} {b}', { a: '{b}<x>', c: 3 })).toBe('Hi {b}<x> {b}');
    expect(interpolate('Hi {a}', undefined)).toBe('Hi {a}');
    expect(interpolate('{n} items', { n: 2 })).toBe('2 items');
  });
});

describe('pluralForm', () => {
  it('uses the locale’s rules, with "other" for every non-"one" category', () => {
    expect(pluralForm(1, 'en')).toBe('one');
    expect(pluralForm(2, 'en')).toBe('other');
    expect(pluralForm(0, 'en')).toBe('other');
    expect(pluralForm(1, 'ar')).toBe('one');
    expect(pluralForm(2, 'ar')).toBe('other');
  });
});
