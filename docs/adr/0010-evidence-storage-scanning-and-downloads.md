# ADR-010: Evidence files — private object storage, scan before storing, downloads through the API

- **Status:** Accepted (2026-10-14); storage and scanner **products** TBC with Sirius IT (A6)
- **Requirements:** R1-04 (evidence per criterion), R1-01 / NFR-SEC-01 (entity isolation), NFR-PRIV-01, NFR-INT-01; reused later by R2-01 (data uploads)
- **Related:** ADR-002 (Row-Level Security), ADR-008 (field encryption), `packages/integrations`, `apps/api/src/modules/evidence`

## Context

Subsidiary HR attaches evidence (appraisals, contracts, payslips) to each criterion of each employee. These are personal documents. The project rules ask for: type allow-list by magic bytes, size limits, a malware-scan hook before a file is usable, storage outside the web root with random names, and "short-lived signed URLs after an authorisation check" for downloads.

Hosting (A6) isn't decided, so neither is the object store nor the scanner product.

## Decision

1. **S3-compatible object storage behind an `ObjectStore` interface** (`@peopleforge/integrations`). One private bucket per environment; keys are server-generated (`evidence/<entity-id>/<file-id>`), never derived from file names. Server-side encryption is requested on every object. A `filesystem` driver exists for development and tests only; the API refuses it in UAT and production.
2. **Scan before storing, synchronously.** The API checks, in order: request visible to the caller → employee and criterion belong to the request → criterion accepts files → at most 5 files → size (≤ 10 MB, or the criterion's lower limit) → **type from the content** (magic bytes, against the criterion's allow-list) → **ClamAV `INSTREAM` scan**. Only a clean file is stored and recorded. An infected file is refused (and logged as a security event without its name); a scanner timeout or outage refuses the upload with 503. There is no "pending scan" state, so no file is ever usable unscanned.
3. **Downloads stream through the API — not signed URLs.** `GET /api/v1/increment-requests/{id}/evidence/{evidenceId}` re-checks the caller on every download (RLS + the draft rule), then streams the file as an attachment with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and the stored (detected) content type. The web app's route passes it through with a sandboxing CSP.
4. **Removal is a soft delete** of the record; the object stays until the retention period (Q10) is agreed and a purge job exists.
5. **Resilience:** timeouts on every storage and scanner call, the SDK's retries with backoff for storage, a circuit breaker on each dependency, and both in `/health/ready`.

## Why not signed URLs (deviation from the project rule)

Signed URLs would make the bucket reachable from browsers. That needs a public (or VPN-reachable) storage endpoint in the approved region, plus CORS on the bucket. Once issued, a URL also works for anyone who holds it until it expires, so the authorisation check happens once instead of on every download. With files of at most 10 MB and a small user base, streaming through the API is affordable. It keeps storage private, audits every download in one place (R1-15 when it lands), and needs nothing from the storage provider beyond the S3 API. If volumes grow (R2 raw extracts), short-lived signed URLs can be added for those files behind the same authorisation check, after Sirius IT confirms the network design.

## Alternatives

- **Asynchronous scanning** (store, mark "pending", scan in the worker): needed for very large files and lets the user continue sooner. Rejected for now: no worker exists yet (it arrives with R1-13), and the UI would need a pending state. Revisit with R2-01 bulk uploads.
- **Files in PostgreSQL (`bytea`)**: simple and transactional, but bloats backups and the WAL, and doesn't fit R2's large uploads.
- **MinIO for local development**: the project is archived and its images are no longer published, so it isn't used. Locally, a filesystem store or an S3 mock (`adobe/s3mock`) stands in. Production uses the approved in-region S3-compatible store.

## Consequences

- The API needs memory for concurrent uploads (10 MB each, held in memory and never written to its disk), and proxies must accept 11 MB bodies (DEPLOYMENT.md §4).
- The object store and the database can disagree after a crash between "stored" and "recorded"; the API removes the object when recording fails, and logs `evidence_orphaned` if even that fails (a cleanup job can list orphans later).
- Evidence retention (Q10) and an audit record per download (R1-15) are still to come; downloads are logged as `evidence_downloaded` meanwhile.
