# Schema `auth` — sign-in (web app)

Owned by the web app (Better Auth 1.7, ADR-003). Created by `apps/web/db/migrations/0001_auth_schema.up.sql`; rollback `0001_auth_schema.down.sql`. The business schema (ADR-002) never references these tables. People are identified across PeopleForge by their identity-provider object ID (`account.accountId`, Entra `oid`), which is also the API's `userId`.

**Access:** owner `peopleforge_owner` (DDL, migrations); app role `peopleforge_app` has `USAGE` on the schema and `SELECT, INSERT, UPDATE, DELETE` on the four tables, nothing else. The web app connects with `search_path=auth`.

**Sensitivity key:** _PII_ = personal data (NFR-PRIV-01); _Secret_ = credential material; _Internal_ = no personal data.

## `auth."user"` — one row per person who has signed in with a PeopleForge role

| Column          | Type        | Null | Meaning                                                  | Sensitivity | BRD ref     |
| --------------- | ----------- | ---- | -------------------------------------------------------- | ----------- | ----------- |
| `id`            | text        | no   | Internal random ID (Better Auth)                         | Internal    | NFR-SEC-01  |
| `name`          | text        | no   | Display name from the identity provider (NFC)            | PII         | NFR-PRIV-01 |
| `email`         | text        | no   | Work email / sign-in name, lower-cased, unique           | PII         | NFR-PRIV-01 |
| `emailVerified` | boolean     | no   | Always true: the organisation's directory vouches for it | Internal    | —           |
| `image`         | text        | yes  | Unused (no profile photos are fetched)                   | PII         | —           |
| `createdAt`     | timestamptz | no   | First sign-in                                            | Internal    | NFR-AUD-01  |
| `updatedAt`     | timestamptz | no   | Last change                                              | Internal    | —           |

## `auth.session` — active web sessions

| Column                   | Type        | Null | Meaning                                                | Sensitivity | BRD ref    |
| ------------------------ | ----------- | ---- | ------------------------------------------------------ | ----------- | ---------- |
| `id`                     | text        | no   | Internal ID                                            | Internal    | —          |
| `token`                  | text        | no   | Session token (its signed form is the HttpOnly cookie) | Secret      | NFR-SEC-01 |
| `expiresAt`              | timestamptz | no   | Absolute end: 8 hours after sign-in                    | Internal    | NFR-SEC-01 |
| `ipAddress`              | text        | yes  | Client IP at sign-in                                   | PII         | NFR-AUD-01 |
| `userAgent`              | text        | yes  | Browser at sign-in                                     | PII         | NFR-AUD-01 |
| `userId`                 | text        | no   | → `user.id` (cascade delete)                           | Internal    | —          |
| `createdAt`, `updatedAt` | timestamptz | no   | Timestamps                                             | Internal    | —          |

## `auth.account` — the person's identity-provider account and tokens

| Column                                          | Type        | Null | Meaning                                                                               | Sensitivity | BRD ref    |
| ----------------------------------------------- | ----------- | ---- | ------------------------------------------------------------------------------------- | ----------- | ---------- |
| `id`                                            | text        | no   | Internal ID                                                                           | Internal    | —          |
| `accountId`                                     | text        | no   | Identity-provider object ID (Entra `oid`); unique with `providerId`                   | PII         | NFR-SEC-01 |
| `providerId`                                    | text        | no   | `sirius` (the organisation's identity provider)                                       | Internal    | —          |
| `userId`                                        | text        | no   | → `user.id` (cascade delete)                                                          | Internal    | —          |
| `accessToken`                                   | text        | yes  | Access token for the API — **encrypted** (XChaCha20-Poly1305, `AUTH_SECRET`)          | Secret      | NFR-SEC-01 |
| `refreshToken`                                  | text        | yes  | Refresh token — **encrypted**                                                         | Secret      | NFR-SEC-01 |
| `idToken`                                       | text        | yes  | Last ID token, kept for provider logout (`id_token_hint`); plain, contains name/email | PII         | NFR-SEC-01 |
| `accessTokenExpiresAt`, `refreshTokenExpiresAt` | timestamptz | yes  | Token expiry                                                                          | Internal    | —          |
| `scope`                                         | text        | yes  | Granted scopes                                                                        | Internal    | —          |
| `password`                                      | text        | yes  | Always null: password sign-in is disabled                                             | —           | —          |
| `createdAt`, `updatedAt`                        | timestamptz | no   | Timestamps                                                                            | Internal    | —          |

## `auth.verification` — short-lived sign-in state

Holds the OAuth `state`, PKCE verifier and nonce between "Sign in" and the provider's callback (minutes). Columns: `id`, `identifier`, `value` (Secret), `expiresAt`, `createdAt`, `updatedAt`.

## Indexes

| Index                           | Why                                             |
| ------------------------------- | ----------------------------------------------- |
| `session_user_id_idx`           | Sign-out and session listing per user           |
| `session_expires_at_idx`        | Purging expired sessions                        |
| `account_user_id_idx`           | Token lookup per user (every API call)          |
| `account_provider_account_uidx` | One local account per identity-provider account |
| `verification_identifier_idx`   | Callback looks up its state                     |
| `verification_expires_at_idx`   | Purging expired sign-in state                   |

## Retention

- `session`: until sign-out or `expiresAt` (8 h). `verification`: until used or expired (minutes).
- Expired rows are removed by Better Auth when it meets them; a scheduled purge of expired `session` and `verification` rows is due with the worker (R1-13 work package).
- `user` / `account`: while the person has a PeopleForge role. Removing a leaver's rows when their role is withdrawn is part of user administration (NFR-PRIV-01, to agree with Sirius HR: retention period).
