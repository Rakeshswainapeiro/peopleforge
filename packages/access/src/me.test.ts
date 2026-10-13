import { describe, expect, it } from 'vitest';
import { MeSchema } from './me.js';

const SUB_A = '00000000-0000-4000-8000-0000000e000a';
const valid = {
  userId: 'oid-1',
  username: 'pf.alpha.hr',
  name: 'Alpha HR',
  roles: ['PeopleForge.SubsidiaryHR'],
  scope: 'entity',
  entityIds: [SUB_A],
  permissions: ['increment_request:create'],
  entities: [{ id: SUB_A, code: 'SUB-A', name: { en: 'Subsidiary A', ar: 'الشركة أ' } }],
};

describe('MeSchema', () => {
  it('accepts the documented response', () => {
    expect(MeSchema.parse(valid)).toEqual(valid);
  });

  it('drops permissions this client does not know instead of trusting them', () => {
    const parsed = MeSchema.parse({ ...valid, permissions: ['report:read_executive', 'future:x'] });
    expect(parsed.permissions).toEqual(['report:read_executive']);
  });

  it.each([
    ['an unknown scope', { scope: 'everything' }],
    ['an entity without an English name', { entities: [{ id: SUB_A, code: 'A', name: {} }] }],
    ['an entity ID that is not a UUID', { entities: [{ id: 'x', code: 'A', name: { en: 'A' } }] }],
  ])('refuses %s', (_label, override) => {
    expect(MeSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});
