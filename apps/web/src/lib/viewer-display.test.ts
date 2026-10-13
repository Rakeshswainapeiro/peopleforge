import { describe, expect, it } from 'vitest';
import { displayName, entityName, initials, roleLabel } from './viewer-display';

describe('displayName', () => {
  it.each([
    [{ name: 'Reviewer Test', username: 'pf.reviewer', userId: 'oid' }, 'Reviewer Test'],
    [{ name: null, username: 'pf.reviewer', userId: 'oid' }, 'pf.reviewer'],
    [{ name: null, username: null, userId: 'oid' }, 'oid'],
  ])('falls back from name to sign-in name to ID (%j)', (me, expected) => {
    expect(displayName(me)).toBe(expected);
  });
});

describe('initials', () => {
  it.each([
    ['Reviewer Test', 'RT'],
    ['Aisha bint Rahman', 'AR'],
    ['pf.reviewer', 'P'],
    ['  élodie   martin ', 'ÉM'],
    ['عائشة رحمن', 'عر'],
    ['', ''],
  ])('%j → %j', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe('roleLabel', () => {
  it('describes a person by their most senior PeopleForge role', () => {
    expect(roleLabel(['PeopleForge.SubsidiaryHR', 'PeopleForge.Admin'])).toBe('roles.admin');
    expect(roleLabel(['PeopleForge.Executive'])).toBe('roles.executive');
    expect(roleLabel(['PeopleForge.SubsidiaryHR'])).toBe('roles.subsidiaryHr');
    expect(roleLabel(['DealForge.CIO'])).toBe('roles.none');
  });
});

describe('entityName', () => {
  const entity = { id: 'e', code: 'SUB-A', name: { en: 'Subsidiary A', ar: 'الشركة أ' } };

  it('uses the viewer language and falls back to English', () => {
    expect(entityName(entity, 'ar')).toBe('الشركة أ');
    expect(entityName({ ...entity, name: { en: 'Subsidiary A' } }, 'ar')).toBe('Subsidiary A');
  });
});
