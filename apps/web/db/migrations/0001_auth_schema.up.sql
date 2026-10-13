-- 0001 — Sign-in tables for the web app (Better Auth 1.7, ADR-003). Schema `auth`.
-- Generated from Better Auth's schema for these options, then reviewed: names qualified,
-- unique (providerId, accountId) added, least-privilege grants for the app role.
-- Data dictionary: docs/database/auth-schema.md.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth."user" (
  "id" text NOT NULL PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL,
  "image" text,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE auth.session (
  "id" text NOT NULL PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES auth."user" ("id") ON DELETE CASCADE
);

CREATE TABLE auth.account (
  "id" text NOT NULL PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES auth."user" ("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE TABLE auth.verification (
  "id" text NOT NULL PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX session_user_id_idx ON auth.session ("userId");
CREATE INDEX session_expires_at_idx ON auth.session ("expiresAt");
CREATE INDEX account_user_id_idx ON auth.account ("userId");
-- One local account per identity-provider account (Entra object ID).
CREATE UNIQUE INDEX account_provider_account_uidx ON auth.account ("providerId", "accountId");
CREATE INDEX verification_identifier_idx ON auth.verification ("identifier");
CREATE INDEX verification_expires_at_idx ON auth.verification ("expiresAt");

-- The app connects as {{APP_ROLE}}: data access only, no DDL.
GRANT USAGE ON SCHEMA auth TO {{APP_ROLE}};
GRANT SELECT, INSERT, UPDATE, DELETE
  ON auth."user", auth.session, auth.account, auth.verification
  TO {{APP_ROLE}};
