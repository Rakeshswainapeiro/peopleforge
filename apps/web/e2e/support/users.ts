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
  noRole: {
    id: '7d6a1c3e-2b4f-4c8a-9e10-000000000006',
    email: 'pf.norole@sirius.local',
    username: 'pf.norole',
    name: 'No Role Test',
    roles: [],
  },
} as const satisfies Record<string, TestOidcUser>;

export type TestUser = keyof typeof USERS;
