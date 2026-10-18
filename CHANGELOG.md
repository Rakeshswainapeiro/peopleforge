# Changelog

All notable changes are recorded here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer.

## [Unreleased]

### Added — slice S6: reports, request history and the audit trail (R1-14, R1-15)

- **Reports** (`/reports`): RP-01, the increment status report, with the dashboard's filters (period, subsidiary for Sirius HR, status, search), a preview and **Download Excel** / **Download PDF**. The Excel file has Summary, Requests and Employees sheets (status, proposed and approved %, increase, turnaround time in calendar days) and opens cleanly in Excel; the PDF is A4 landscape with page numbers and Arabic-capable fonts. Files are in the reader's language with dates in Dubai time; text cells are protected against formula injection. Every download is recorded in the audit trail with the filters (never the rows).
- **History** on every request's page: what happened, who did it and when, newest first, in words ("Yusuf Karim returned to the subsidiary", "C3 verified for Aisha Rahman"). Subsidiaries see their own requests' history.
- **Audit trail** (`/audit`, Sirius HR reviewers and admins): every recorded action with search, **From / To** dates and "Only {name}" to see one person's actions.
- The trail now records the actor's name (migration `0011_history_reports`). API: `GET /reports/increment-requests`, `GET /increment-requests/{id}/history`, `GET /audit`. OpenAPI 0.11.0.

### Security — slice S6

- RP-01 needs increment-request and compensation access as well as the report permission: an admin (who configures, but must not see pay) is refused (403). The web app shows executives and admins the coming group reports instead.

### Added — slice S5b: questions and answers per employee (R1-08)

- **Questions and answers** on every submitted employee's page: Sirius HR reviewers ask, the subsidiary's HR answers, in a thread that shows who wrote what and when, and who has to answer next ("Waiting for your answer" / "Waiting for Sirius HR"). Read-only once the request is decided; executives read only.
- **Conversations** (`/conversations`, sidebar): every employee with questions, latest first, with the latest message, **Waiting for you** and **All** chips, and **Respond** where an answer is due.
- **Notifications and emails:** "Sirius HR asked a question about Aisha Rahman" (action needed, Respond opens the conversation) and "SUB-A answered about Aisha Rahman" to the reviewers. Emails say that something was asked, never what.
- Messages are stored encrypted and append-only (migration `0010_conversations`), audited without their text. API: `GET`/`POST /increment-requests/{id}/lines/{lineId}/messages` (Idempotency-Key), `GET /conversations`. OpenAPI 0.10.0.

### Added — slice S5a: Sirius HR's review, decisions, returns and resubmission (R1-07 … R1-10)

- **Review queue** (`/review`, Sirius HR reviewers): every employee waiting for Sirius HR across subsidiaries, oldest first, with chips **To review · Returned · Past reminder · All open · All** and their counts, a subsidiary filter and search. Each row shows the request and its stage, the proposed %, what the subsidiary submitted per criterion, how many criteria are verified and how long the employee has waited (amber "Past 2-day reminder" after 2 calendar days). No salaries in the list.
- **Review employee** (the employee page, for reviewers): **Mark verified** per criterion (and Undo), with who verified it and when; a **Decision** panel with **Approve** (enabled once all five are verified; as proposed, or a different % with a reason and comment), **Reject** and **Return** (reason and comment, which the subsidiary sees). After deciding: a confirmation and **Next employee**.
- **Statuses** per employee (With Sirius HR / To review, Approved, Rejected, Returned) and per request (Under review, Returned, Approved, Partly approved, Rejected), shown everywhere with text and colour. The **stage** is now real: the first criterion not yet verified for every employee still in review, then Awaiting decision, then Decided.
- **Returns (R1-08):** the request detail shows which employees came back and Sirius HR's question; **Update and resubmit** opens the editor where only the returned employees can change; **Resubmit to Sirius HR** asks for an optional note. Sirius HR checks resubmitted employees again from scratch. "Needs your action" lists returns beside drafts with **Respond**.
- **Request Tracker** (Home for Sirius HR): subsidiary filter, Submitted date, who has each request (Sirius HR, the subsidiary, Closed) and cards for To review, Returned to subsidiaries, Approved (full / partly) and Rejected. Subsidiary HR's cards now count replies needed, approvals and rejections.
- **Notifications and emails:** stage moved, employee approved / rejected / returned (action needed, **Respond**), request decided with its final status, and returned employees resubmitted (to reviewers). Display values only.
- API: `PUT`/`DELETE /increment-requests/{id}/lines/{lineId}/verifications/{criterionId}`, `POST …/lines/{lineId}/decision` (Idempotency-Key), `POST …/{id}/resubmit` (Idempotency-Key), `GET /review-queue`; requests carry `stage`, `statusChangedAt`, `decidedAt`, and each employee `reviewStatus`, `decision` and per-criterion `verification`; the request list takes `entityId`. OpenAPI 0.9.0.
- Migration `0009_review_decisions` (statuses, `decided_at`, `request_line.review_status`, `criterion_verification`, append-only `line_decision` with encrypted comments and approved values). ADR-013.

### Fixed — criteria cards (R1-03, R1-06)

- **A criterion card now follows what's on screen.** Choosing Pass or Fail, typing a justification or attaching a file updates the card's mark, colour and "To complete" line straight away; before, they waited for **Save draft**, so a card with Pass chosen still said "choose Pass or Fail". The card uses the API's own completeness rule (now shared in `@peopleforge/contracts`), so it never disagrees with what saving records.
- **Buttons match the Figma:** the Pass | Fail and % | AED switches are joined segments filled edge to edge (no inset), and **Attach File** is compact with body-size text (new `compact` button size).

### Added — slice S4b-2: email worker (R1-07, R1-13)

- **Emails are sent.** A new worker (`apps/worker`) sends the email for every notification: the submitter gets "INC-… submitted to Sirius HR", and the Sirius HR reviewers' mailbox gets "New increment request INC-… from SUB-A" with who submitted it. Each email has a plain-text and an HTML part and a **View in PeopleForge** link to the request. No pay, percentages or justifications.
- **Reliable delivery (ADR-012):** emails are claimed from the outbox with `SKIP LOCKED` and a lease (several workers are safe; a crash re-sends, never loses), retried after 1 min, 5 min, 30 min, 2 h and 6 h, then marked dead and alerted on. A refused address is dead at once. Probes on port 4200; `email_outbox_stats` and `email_outbox_alert` log events for dashboards and alerts.
- **Addresses:** a user's work email from sign-in; for a role, a shared mailbox set as configuration (`notify.role_mailbox`). No address: the email is skipped and logged, the in-app notification is unaffected.
- **Transports:** SMTP (TLS required outside dev/test) and `.eml` files for dev/test. Mailpit for local development: `infra/local/compose.yaml` (also S3Mock and ClamAV, under `--profile evidence`).
- Migrations core `0008_email_worker` and web `0002_recipient_email`, and a new database role **`peopleforge_worker`** that must be created first (DEPLOYMENT.md §6). New image `infra/docker/worker.Dockerfile`; env reference in DEPLOYMENT.md §4; runbook `docs/runbooks/email-outbox.md`.
- `@peopleforge/i18n`: the web app and the worker share one message-catalogue implementation (English fallback, interpolation, plural forms).

### Added — slice S4c: design refresh (R1-06, R1-07, R1-10)

- **Request detail page** (`/requests/{id}`, Figma "Request detail"): the reference, "Submitted 15 Oct 2026, 11:14 by Priya Nair · Subsidiary A · With Sirius HR", **Where this request is** (Submitted → Criterion 1 … 5 → Decision), the Employees / Total increment per month / Average increment cards, and the employees with salary, proposal (% and amount), criteria marks, status and **View Status**. Right after submitting it shows a green confirmation with **View Employees** and ✕. Subsidiary HR gets **+ New increment request** here; Sirius HR doesn't.
- **Drafts are edited at `/requests/{id}/edit`**, with a breadcrumb ("My requests / INC-… · Draft") and the criteria beside a "Ready to submit?" card that stays in view. Old links still work: `/requests/{id}` sends a draft to its editor (or "not found" for Sirius HR).
- **Submit confirmation** now shows the three figures and every employee about to go (grade, proposed %, criteria complete) and what happens next. Buttons: **Yes, submit to Sirius HR** and **Go back and edit**.
- **Needs your action** is a table above the cards: type, employees and reference, what's needed, how long it has waited (red with "(waiting long)" after 5 days), and **Continue draft**. Longest waiting first, the first 5, with "Showing x of y" and **See all drafts**.
- The sidebar names home by role: **My Request** for Subsidiary HR, **Increment requests** for Sirius HR. The draft editor highlights **New Request**; a request's pages highlight home.
- Design system: `Breadcrumb`, a large (`lg`) `Dialog`. One route helper (`lib/routes.ts`) builds every request link.
- API: requests carry `submittedByName`; the list takes `order=newest|oldest`. OpenAPI 0.8.0. Migration `0007_submitter_name` (DEPLOYMENT.md).

### Fixed — S4c

- The API logged a false IPv6 warning from the rate-limit library at every start (the key already groups IPv6 addresses by /56).
- Removed unused message keys.

### Changed — S4c

- The "Needs your action" ✕ is gone (not in the new designs).

### Added — slice S4b-1: "My increment requests" dashboard (R1-10, DASH-D1, R1-06)

- **Home is now the dashboard** for Subsidiary HR and Sirius HR, following the Figma:
  - KPI cards: Drafts, With Sirius HR, Needs your reply, Approved, Rejected. Replies and decisions count zero until S5.
  - "Needs your action": each draft with "n employees added · criteria x of y complete" and **Continue draft**. ✕ hides it until the next visit.
  - **By request**: request, created, employees (with **View**), review stage bar, status, age (calendar days since the last status change, Dubai), and who has it now ("You" for a draft, "Sirius HR" once submitted).
  - **By employee**: proposed %, a ✓/✗/○ mark per criterion, employee status, last update, and **View Status**.
  - Filters for search (employee name or ID, or request reference, matched anywhere and Arabic-aware), period (increment cycle, default the open one) and status. They apply as you type or choose, without a page reload. Rows per page 10/25/50 and pagination. Everything is in the URL, so links and Back work.
  - Sirius HR sees every subsidiary's submitted requests with a Subsidiary column, no drafts and no Drafts card. Roles without request access keep the welcome page.
- **Employee status page** (`/requests/{id}/employees/{lineId}`): breadcrumb, current salary, proposed % and amount, new salary if approved, criteria passed with what's left, progress, and the criteria table with justifications and evidence downloads.
- API: `GET /api/v1/increment-requests` takes `cycleId` and `search`, and each item now has `entity`, `statusChangedAt`, `stage` and `criteria` progress. New `GET /api/v1/increment-requests/summary` and `GET /api/v1/increment-request-lines` (no salaries). OpenAPI 0.7.0.
- Migration `0006_dashboard`: `status_changed_at`, a cycle index, and trigram search indexes (enables `pg_trgm`; DEPLOYMENT.md).
- Design system: `StageMeter`, a marks-only `CriteriaProgress` variant, a small (`sm`) control size, and `aria-label` on `ButtonLink`. Portal pages share one loading skeleton, one Progress card, one pagination-label helper and one plural helper.

### Fixed

- **All users shared one API rate limit.** The limit was per IP, and every user reaches the API through the web server, so about 50 dashboard views a minute across the company would have refused everyone. Each caller now has its own budget (`RATE_LIMIT_MAX`, keyed on a hash of the access token), and a per-IP ceiling (`RATE_LIMIT_IP_MAX`, default 3,000/min) still stops floods. New env var: DEPLOYMENT.md §4.

### Changed

- The request list's items no longer carry `entityId` and `updatedAt` (replaced by `entity` and `statusChangedAt`); the web app is the only client.

### Fixed — UX polish after S4a review

- **The confirmation dialog opened in the top-left corner** in some browsers. It relied on the browser's default `<dialog>` centring, which Tailwind's reset removes in some engines. The dialog now lays itself out explicitly: a full-window layer that centres the panel and draws its own blurred backdrop. An end-to-end test checks it is centred in the viewport.
- **Dialog behaviour:** opens and closes with a short fade and scale. Focus moves to the panel, so no focus ring flashes on Cancel. The page behind doesn't scroll and doesn't shift sideways (the scrollbar width is compensated on Windows). While submitting, Esc and the backdrop do nothing, and the button reads "Submitting…". The submit confirmation is announced as an alert dialog.
- **Notifications:** the whole row opens the notification, not just View. Rows highlight on hover, and unread rows carry a dot as well as bold text. The unread badge on the bell is the same colour whether or not the page is current.
- **Navigation feedback:** moving between portal pages shows the page's outline in the content area while the sidebar stays put. It appears only if loading takes more than a moment, so fast pages don't flash.
- Alerts ("Draft saved", "Request submitted…") fade in instead of popping.
- Design system: `Button` gains `stretched` (the whole row or card clicks it; no press-scale, which would lose the click). New `lockPageScroll` helper. New `animate-enter` motion token, which is turned off for users who prefer reduced motion.

### Added — slice S4a: submit to Sirius HR, audit trail, notifications (R1-07, R1-13, R1-15)

- **Submit to Sirius HR.** When every employee has a proposal and all criteria are complete, **Submit to Sirius HR** opens a confirmation dialog ("… You can’t edit the request afterwards."). Submitting saves the draft first, so nothing typed is lost. It is refused after the cycle's submission deadline (end of that day, Asia/Dubai), if the draft changed meanwhile, or if anything is incomplete. A repeated click or retry doesn't submit twice (idempotency key).
- **Submitted requests are read-only.** The page shows "Increment request INC-…", "Waiting for Sirius HR" with the submission date, and a progress list (Employees added → Submitted → Review in progress → Decision). The database refuses any change to a submitted request, not only the UI.
- **Notifications.** The submitter gets "Request submitted", and Sirius HR reviewers get "New request from SUB-A with n employees" marked **Action needed**. The sidebar bell shows the unread count. The notifications page has All / Unread / Action needed filters, View (marks it read and opens the request), Mark all as Read and pagination. Emails are queued (outbox) and sent once the worker and the email provider arrive (S4b, A6).
- **Audit trail** (`audit.audit_log`): request created, draft saved, submitted, discarded; employee added/removed; evidence uploaded, removed and downloaded. Append-only: the database refuses updates and deletes for every role (ADR-011). Status history in `increments.status_event`, the basis of TAT (R1-11).
- Migration `0005_submission_audit_notifications`. API: `POST /api/v1/increment-requests/{id}/submit`, `GET /api/v1/notifications`, `GET /api/v1/notifications/summary`, `POST /api/v1/notifications/read`; requests now carry `submittedAt` and the cycle's `submissionDeadline` (OpenAPI 0.6.0).
- Design system: `Dialog` (native `<dialog>`, focus trapped, Esc and backdrop close), unread badge on `NavItem`.

### Changed

- Dates show as "15 Oct 2026" (en-GB order, business time zone), as in the Figma.
- Evidence downloads are recorded in the audit trail instead of a log line.
- The "Only … employees can be added" hint shows only while the request can be edited.

### Fixed

- **Sections 2 and 3 didn't match the Figma.** Section 2 is now titled "2. Eligibility criteria for {name}". Each criterion card has a result mark (✓/✗/○), Pass/Fail at the top right, the placeholder "Why does this employee pass or fail this criterion?", a dashed **Attach File** button followed by "PDF, JPG, PNG, XLSX · max 10 MB *", and an amber outline until the criterion is complete. The extra badges and hints are gone. Section 3 lists "All 5 criteria complete" / "5 criteria incomplete" with a mark per employee, the grey note "n of m employees still have incomplete criteria…", a full-width **Submit to Sirius HR** and the Figma caption. Design system: `StatusMark` (shared with `CriteriaProgress`) and the `dashed` button variant.

### Added — slice S3: criteria and evidence (R1-03, R1-04, R1-06)

- **Section 2 "Eligibility criteria"**, one employee at a time: Pass or Fail, a justification (up to 2,000 characters) and evidence files for each criterion. "Save draft" saves them together with the proposed increments. The row's pencil saves and opens the next employee, so nothing typed is lost. Fail needs the same justification and evidence as Pass.
- **Evidence files:** up to 5 per criterion, up to 10 MB each. The type is judged by content against the criterion's list, and every file goes through a ClamAV scan before it is stored. Infected and disguised files are refused. Files go to private S3-compatible storage under random keys. Choosing a file uploads it at once; files can be removed (soft delete), and downloads go through the API as attachments (ADR-010).
- **Completeness everywhere:** the Criteria column shows ✓/✗ once a criterion is complete and ○ before, with "n/5 complete". Each criterion shows "Complete" or "To complete: …".
- **Section 3 "Ready to submit?":** who is ready and what each other employee still needs. "Submit to Sirius HR" stays disabled until S4.
- `@peopleforge/integrations`: S3 object store (filesystem for dev/test), ClamAV adapter, content-type detection, file-name sanitising, circuit breaker, shared env schema. A protocol-level fake clamd is included for tests.
- Migration `0004_criteria_evidence`: `increments.criterion_result` (justification encrypted) and `increments.evidence_file`, both with Row-Level Security.
- API: `PUT /api/v1/increment-requests/{id}/draft`, `POST …/evidence` (multipart), `GET` and `DELETE …/evidence/{evidenceId}`. Readiness now also checks object storage and the malware scanner. New env vars `OBJECT_STORE_*`, `S3_*`, `MALWARE_SCANNER`, `CLAMAV_*` (DEPLOYMENT.md §4).
- Design system: `SegmentedChoice` tones and icons (Pass/Fail) and a `form` attribute; `FileChip`.

### Changed

- `PUT …/proposals` is replaced by `PUT …/draft` (it was never released). The request response now carries the criteria configuration, each line's `criteria` with `missing`, and `totals.ready`.
- The draft page has one "Save draft" form whose fields sit in different cards (the `form` attribute), so the Add-employee form stays separate.
- Uploads through the web app may take up to 60 s (sent, checked, scanned); proxies must accept 11 MB bodies.

### Fixed

- **An empty draft stayed under "Needs your action".** Removing a draft's last employee now discards the draft (soft delete). The user returns to Home with "Draft discarded: it had no employees left." A draft must also be created with at least one employee (`employeeIds` minItems 1). `DELETE …/lines/{lineId}` returns `{ discarded, request }`.
- **The chosen "% | AED" segment turned white on hover, hiding its white text.** The current language button had the same bug. Hover styles now apply only to unchosen segments and enabled buttons, and an end-to-end test checks the hovered background stays dark.

- Removing an employee from a draft failed with "Something went wrong". React overrides a button's `name` when its `formAction` is a function, so the line ID never reached the server. The ID is now bound to the action, and the tests cover it.
- The sidebar lost its selection while editing a draft (`/requests/<id>`). **New Request** now stays selected, as in the Figma.
- In `next dev`, the CSP blocked the Next.js dev overlay's inline styles. That filled the console with errors and set off the dev "Issues" badge. Development now allows inline styles; production keeps nonce-only styles.

### Changed

- The draft editor now follows the Figma:
  - the title stays "New increment request", with role · reference · Draft above it;
  - "Add employee" and "+ Add" sit at the right of the section header;
  - the table has larger "% | AED" and value controls;
  - a **Criteria** column (`CriteriaProgress`, "0/5 complete" until S3) replaces "New monthly", which is not in the Figma;
  - totals read "Employees: · Total proposed increase: · Average:".
- Design system: `CriteriaProgress`; `controlSize="lg"` for Input/Select; roomier cards (24 px); semibold names in tables.
- The request detail API includes the request's pinned `criteria`.
- End-to-end tests now fail on any browser console error or uncaught exception.

### Added — slice S2: draft increment requests (R1-02)

- Subsidiary HR can create a draft increment request for the open cycle and add employees from their subsidiary. Each employee's grade and monthly salary are snapshotted, encrypted. The request then takes a proposed increment per employee, as a % or as an amount in the salary currency. Totals show employees, total monthly increase per currency, and the average %. Employees can be removed, and drafts are listed under "Needs your action" on Home.
- Arithmetic uses decimal.js, never floating point. A % increment is rounded half-up to 2 decimals. Proposals must be above 0 and at most 100% (an amount up to the current salary). The average is the simple mean of the percentages, to 1 decimal. Worked examples are in `money.test.ts`.
- Migration `0003_increment_requests`, protected by:
  - Row-Level Security;
  - composite keys, so a line can only hold an employee of the request's own subsidiary;
  - per-cycle references `INC-2026-0001`;
  - idempotent creation (`Idempotency-Key`);
  - optimistic locking (`version`).
- API: `GET/POST /api/v1/increment-requests`, `GET …/{id}`, `POST …/{id}/lines`, `DELETE …/{id}/lines/{lineId}`, `PUT …/{id}/proposals`, `GET /api/v1/increment-cycles/open`, `GET /api/v1/employees`. New permission `increment_request:read` (Subsidiary HR and Reviewer). Drafts are hidden from Sirius until submitted. The API now needs `DATA_ENCRYPTION_KEYS` / `DATA_ENCRYPTION_ACTIVE_KEY`.
- Design system: `SegmentedChoice` (the Figma "% | AED" switch).

### Changed

- `@peopleforge/access` renamed to `@peopleforge/contracts`: it now carries the request and response schemas too.

### Added — design system (ADR-009)

- `packages/ui` (`@peopleforge/ui`): Figma tokens as a Tailwind theme, plus the components:
  - layout and content: Button/ButtonLink, Badge, Card, StatCard, PageHeader, Alert, Table, EmptyState;
  - inputs and navigation: Field/Input/Select/Textarea, ToggleGroup, Pagination;
  - progress and loading: ProgressSteps, Spinner, Skeleton;
  - identity: Avatar, Wordmark/BrandMark, NavItem, and an icon set.
    Every interactive part has a pointer cursor, hover/active states, 150 ms transitions and a keyboard focus ring; motion is reduced on request. Guide: `docs/design/design-system.md`.
- Portal restyled to the Figma: the dark sidebar has the PeopleForge wordmark, white active pill, initials avatar, and a sign-out icon with role and subsidiary. Page headers, cards, not-found, error and loading (skeleton) states use the design system.
- Shared ESLint rules for React workspaces (`eslint/react-rules.mjs`): i18n literals and physical-direction classes, now also inside variant tables.

### Added — slice S1 (ADR-002, ADR-008)

- `packages/db` (`@peopleforge/db`): plain-SQL migrations for schemas `core` (entities, user → entity assignments, increment cycles, interim employee directory) and `increments` (criteria sets and criteria), Row-Level Security (`ENABLE` + `FORCE`) on every entity-owned table, `withScope` for per-transaction scope, typed Kysely access, AES-256-GCM field encryption for salaries bound to table/column/row, and a synthetic dev/test seed (refused in UAT/Prod). One migration runner shared with the web app (`migrations.core`, `migrations.web`). Root scripts `pnpm db:migrate`, `pnpm db:seed`.
- Placeholder configuration (R1-05): "Increment cycle 2026" and a five-criterion set marked `[Placeholder]`, to be replaced when Sirius provides the criteria (A1).
- `packages/contracts` (`@peopleforge/contracts`, first named `access`): roles, permissions and the `/me` contract shared by the API and web, so both change together.
- API: subsidiary HR users are scoped to their `core.user_entity` assignments (R1-01, R2-12); `GET /api/v1/me` returns the visible `entities`; `/health/ready` checks the database; new variables `DATABASE_URL`, `DATABASE_POOL_MAX`. Database outages answer 503, never an unscoped caller.
- Web: portal shell — dark sidebar with Home, New Request, Notifications and Reports filtered by permission, user block with initials, role and subsidiary, language switch and sign-out; responsive (sidebar becomes a header below 1024 px). New Request, Notifications and Reports are placeholders that answer 404 without the permission.
- Integration tests for Row-Level Security against a real PostgreSQL; E2E for the shell and entity scoping.

### Fixed

- `DEPLOYMENT.md` had been emptied by an earlier commit (614eaa3); restored and brought up to date (web and migration variables, migration procedure).

- Endless redirect between `/` and `/sign-in` after signing out at the identity provider: a session whose token can't be renewed is now ended via `/session-ended`.
- Sign-in screen spacing matches the Figma and never overflows the viewport, from short laptop screens to large monitors, tablet and phone (`@sirius/login-ui` 0.1.3). In `next dev` the Next.js dev badge is turned off: it was added below the page and made full-height screens scroll.

### Added

- R1 design proposal with BRD gap analysis: `docs/design/r1-increment-portal.md`.

- **Sign-in for the web app** (ADR-003): the shared Sirius sign-in screen (`@sirius/login-ui`, PeopleForge copy in `messages/en.json`), organisation sign-in through Keycloak locally / Entra ID later (`@sirius/auth-better`: OIDC code + PKCE, verified ID tokens, encrypted provider tokens, 8-hour HttpOnly session), "no access" screen for people without a PeopleForge role, sign-out that also ends the provider session, and the home page showing the identity the API confirms (`GET /api/v1/me`).
- Schema `auth` with migration `0001_auth_schema` (up/down), a migration runner (`pnpm --filter @peopleforge/web db:migrate | db:rollback | db:status`) and the data dictionary `docs/database/auth-schema.md`.
- Sign-in events in the web log: `sign_in_succeeded`, `sign_in_rejected` (reason), `sign_in_failed` (code), without personal data.
- End-to-end tests for sign-in, refusal and sign-out against a local test OpenID provider and a separate test database (`peopleforge_test`); CI runs them with a PostgreSQL service.

- The API now verifies OIDC access tokens (`Authorization: Bearer`) from the local Keycloak, shaped like Entra ID: issuer, audience `peopleforge-api`, tenant, signature and expiry are checked; signing keys are discovered from the issuer. New required variables `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_TENANT_ID` (DEPLOYMENT.md §4). ADR-003.
- `GET /api/v1/me` returns `username` and `name`; subsidiary HR users are entity-scoped with no entities until assignments exist.
- 503 `SERVICE_UNAVAILABLE` when the identity provider can't be reached.

### Changed

- The policy guard, decorators, start-up route audit and authentication middleware moved to `@sirius/auth-nest` 0.1.0 (js-platform) so every NestJS app shares them; PeopleForge keeps its permission matrix and principal mapping.

- Renamed to **PeopleForge**: workspaces `@peopleforge/api` and `@peopleforge/web`, images `peopleforge-api` / `peopleforge-web`, app name in the UI. The brand name is not translated, so Arabic falls back to "PeopleForge".
- `config`, `shared-types` and `utils` moved to the `js-platform` repository and are consumed as published `@sirius/*` 0.1.0 packages from the private registry (ADR-0007). Docker builds and CI need the registry URL and a read token.
- Removed two object-injection sinks in the access policy code (role lookup through a `Map`, handler lookup through `Reflect.get`); lint is warning-free.
- API moved from Express to NestJS 12 (ADR-005). Health, security headers, CORS, rate limiting, request IDs, logging, error shape and graceful shutdown behave as before. Entry point is now `dist/main.js`.

### Added

- Deny-by-default access policy: `@Public`, `@Authenticated`, `@RequirePermission` on every route, a global policy guard, and a start-up audit that refuses to boot if any route lacks a policy.
- Role → permission matrix for PeopleForge roles, with tests for separation of duties and executive data limits.
- `GET /api/v1/me` now returns the caller's effective permissions.
- Monorepo foundation: pnpm workspaces, Turborepo, strict TypeScript, ESLint (security, i18n and RTL rules), Prettier, Husky, commitlint.
- `@sirius/shared-types`: API error shape, error codes, cursor pagination, health and locale schemas.
- `@sirius/utils`: redacting JSON logger, CSV/Excel formula-injection guard, text normalisation.
- API: validated config (fail fast), security headers, CORS allow-list, rate limiting, request IDs, minimal request logging, health/readiness endpoints, deny-by-default `/api/v1`, `GET /api/v1/me`, global error handler, graceful shutdown.
- Web: Next.js App Router shell, nonce-based CSP, English/Arabic catalogues with RTL switch, loading/error/not-found states, skip link.
- Dockerfiles (multi-stage, non-root), CI pipeline, ADR-001, DEPLOYMENT.md, SECURITY.md, database conventions, traceability matrix, OpenAPI spec.
