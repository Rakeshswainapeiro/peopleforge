import type { TestOidcUser } from '@sirius/identity/testing';

/** Synthetic people (never real employees), mirroring the local Keycloak realm. */
export const USERS = {
  reviewer: {
    id: '7d6a1c3e-2b4f-4c8a-9e10-000000000002',
    email: 'pf.reviewer@sirius.local',
    username: 'pf.reviewer',
    name: 'Reviewer Test',
    roles: ['PeopleForge.Reviewer'],
  },
  /** Subsidiary HR for Subsidiary A (assignment seeded by @peopleforge/db). */
  alphaHr: {
    id: '7d6a1c3e-2b4f-4c8a-9e10-000000000004',
    email: 'pf.alpha.hr@sirius.local',
    username: 'pf.alpha.hr',
    name: 'Alpha HR Test',
    roles: ['PeopleForge.SubsidiaryHR'],
  },
  /** Subsidiary HR for Subsidiary B: must never see Subsidiary A's requests. */
  betaHr: {
    id: '7d6a1c3e-2b4f-4c8a-9e10-000000000005',
    email: 'pf.beta.hr@sirius.local',
    username: 'pf.beta.hr',
    name: 'Beta HR Test',
    roles: ['PeopleForge.SubsidiaryHR'],
  },
  noRole: {
    id: '7d6a1c3e-2b4f-4c8a-9e10-000000000006',
    email: 'pf.norole@sirius.local',
    username: 'pf.norole',
    name: 'No Role Test',
    roles: [],
  },
} as const satisfies Record<string, TestOidcUser>;

export type TestUser = keyof typeof USERS;
