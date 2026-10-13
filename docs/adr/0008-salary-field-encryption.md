# ADR-008: Field-level encryption of salary and increment amounts

- **Status:** Proposed (2026-10-13), for go-ahead before slice S1 is built.
- **Requirements:** NFR-SEC-01, NFR-PRIV-01; affects R1-02, R1-14, DASH-D3, RP-04 and the R2 compensation views (D6)

## Context

The project rule is field-level encryption for salary and compensation fields, unless an ADR justifies otherwise. Dashboards and reports need totals and averages: the cost of increments per entity, and the average increment %. Encrypted values can't be summed in SQL.

The sensitive amounts are:

- current salary;
- the proposed increment (value, and amount when given as AED);
- the resulting new salary;
- in R2, salary fields of employee records.

Percentages on their own are less sensitive. Combined with a salary they reveal the salary, so they are treated the same.

## Options

| Option                                                         | Protects against                                    | Cost                                                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A. Disk/backup encryption only, plus RLS and column privileges | Stolen disks or backups                             | A database dump, an over-privileged DB user or a SQL injection still reads every salary                                      |
| B. `pgcrypto` in the database, key passed per session          | Dumps and backups                                   | The key travels to the database and can surface in logs, `pg_stat_activity` and extensions; SQL can still decrypt everything |
| **C. Application-level envelope encryption (chosen)**          | Dumps, backups, DB-only compromise, analytics users | Totals are computed in the API or worker, not SQL                                                                            |

## Decision

**C: the API encrypts and decrypts. The database only ever sees ciphertext.**

- **Cipher and key.** AES-256-GCM per value, with a random 96-bit nonce. Encryption is bound to the row and column (associated data `table:column:row-id`), so a ciphertext copied into another row or column fails to decrypt.
- **Storage.** A single `bytea` holds a version byte, the key ID, the nonce, the ciphertext and the tag. The currency stays in plain text, in its own column.
- **Keys.**
  - Data keys come from the secrets store: KMS/vault in the approved region (A6).
  - Locally they come from `DATA_ENCRYPTION_KEYS`, a key-ID → base64 key list.
  - The key ID in each value allows rotation: new writes use the newest key, and a worker job re-encrypts old rows.
- **Arithmetic.** It happens only after decryption, with the decimal library, and with rounding documented and tested.
- **Dashboards and reports.** The worker builds pre-aggregated tables per entity, cycle and grade:
  - counts, total cost and average %;
  - recomputed when requests are decided;
  - protected by RLS like any table.

  These aggregates are stored in plain text because they are far less sensitive than individual pay. A group with fewer than 3 employees is suppressed, so one person's pay can't be read from an "average" of one.

- **Logs and audit.**
  - Amounts never appear in logs. The redaction list includes them.
  - Audit `before`/`after` values store amounts encrypted the same way, and are decrypted only for users holding `audit:read`.
- **Exports.** These are R1-14 / RP-01 Excel and PDF files. They decrypt in the API, stream the file, and record the export in the audit log.

## Consequences

- Searching or sorting by salary in SQL isn't possible. Nothing in the designs needs it. Sorting by salary on a list would mean decrypting the current page in the API, which is acceptable for page sizes up to 100.
- The pre-aggregation job is required before D3/RP-04, slice S7. It also serves NFR-PERF-01 (dashboards under 3 s).
- A lost key means lost salaries. Keys need a backup in the secrets store and a documented recovery path (DEPLOYMENT.md, once A6 names the vault).
- Unit tests cover: round trip; tampering and a moved ciphertext both failing; rotation; and the rounding examples.
