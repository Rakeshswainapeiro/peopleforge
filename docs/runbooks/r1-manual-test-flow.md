# R1 Increment Request Portal — manual test flow

A complete walk through Requirement 1 (R1-01 … R1-15) on a local machine, with the accounts, the values to type and what you should see. It follows one request from draft to final decision, then checks reports, the audit trail, analytics, settings, reminders and subsidiary isolation. Allow about 45 minutes.

Synthetic data only. The five criteria are placeholders until Sirius HR defines them (BRD A1).

## 0. Before you start

Local setup is in the README (`pnpm install`, `pnpm build`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`). After pulling slices S6–S7, run `pnpm install` (new report libraries) and `pnpm db:migrate` (migrations up to `0012`).

| Account       | Password        | Who                                 | Sees                                                     |
| ------------- | --------------- | ----------------------------------- | -------------------------------------------------------- |
| `pf.alpha.hr` | `LocalDev-2026` | Subsidiary HR, Subsidiary A (SUB-A) | Its own requests only                                    |
| `pf.beta.hr`  | `LocalDev-2026` | Subsidiary HR, Subsidiary B (SUB-B) | Its own requests only (used to prove isolation)          |
| `pf.reviewer` | `LocalDev-2026` | Sirius HR Reviewer                  | Every subsidiary's submitted requests, review, analytics |
| `pf.admin`    | `LocalDev-2026` | PeopleForge Admin (settings, audit) | Settings and the audit trail; never decides or sees pay  |

`pf.admin` may not exist in your local Keycloak yet. In the Keycloak admin console, realm **sirius** → **Users** → **Add user** `pf.admin` (email `pf.admin@sirius.local`, first name `Admin`, last name `Test`) → **Credentials**: password `LocalDev-2026`, _Temporary_ off → **Role mapping**: assign the **PeopleForge.Admin** role, the same way `pf.reviewer` has **PeopleForge.Reviewer** (open `pf.reviewer`'s Role mapping to see where it comes from).

- Portal: http://localhost:3000 — use a private window per account, or sign out between steps.
- Emails: Mailpit at http://localhost:58025 (the worker sends them within a few seconds).
- Seeded employees of Subsidiary A: **Aisha Rahman** EMP-1101, G5, AED 14,200/month; **Yusuf Karim** EMP-1102, G6, AED 16,800/month; Mariam Saleh EMP-1103, G4.
- Evidence: any small PDF, PNG, JPG or XLSX (≤ 10 MB). Write down the request reference shown (e.g. `INC-2026-0007`); below it is called **REF**.

## 1. Settings (admin) — R1-05, R1-13

Sign in as `pf.admin`.

1. Sidebar → **Settings**. You see _Eligibility criteria_ (version 1) and _Reminders_ with three triggers: _Waiting for Sirius HR's review_ (2 days), _Returned and not resubmitted_ (2 days), _Submission deadline approaching_ (3 days), each "Default setting".
2. In _Waiting for Sirius HR's review_ set **Days** to `3` → **Save**. Expect "Saved." and, after a reload, "Changed by Admin Test on …". Set it back to `2` → **Save**.
3. Criteria: in **C5**, change _Description (English)_ to `All mandatory training for the year completed (checked by L&D).` → **Publish version 2**. Expect "Version 2 published." and "Version 2, active since …".
4. Clear **C1** _Name (English)_ → **Publish version 3**. Expect the error "Check the highlighted values…"; what you typed stays. Reload to discard.
5. Sidebar → **Audit trail**: the top rows are _Criteria version published_ and _Reminder trigger updated_ by Admin Test.

Requests created from now on use version 2; requests created earlier keep version 1.

## 2. Draft and submit (subsidiary) — R1-01 … R1-07

Sign in as `pf.alpha.hr`.

1. **New Request** → **Add employee**: choose `Aisha Rahman · EMP-1101 · G5` → **Add**. The draft opens; note **REF** in the breadcrumb.
2. **Add employee**: `Yusuf Karim · EMP-1102 · G6` → **Add**.
3. Proposals: _Proposed increase for Aisha Rahman_ `5` (%), _for Yusuf Karim_ `6` (%). Totals: Aisha +AED 710 → 14,910; Yusuf +AED 1,008 → 17,808; total increment AED 1,718/month.
4. Criteria for Aisha (the first employee opens): for **C1 … C4** attach a file and choose **Pass**; type a justification in each, e.g. `C1: rated 4/5 in the 2026 appraisal.`, `C2: 3 years in role.`, `C3: no disciplinary action.`, `C4: below the G5 midpoint.`. **C5**: **Pass**, `Training completed in March.` (a file is optional for C5).
5. **Assess criteria for Yusuf Karim** and do the same (e.g. `C1: rated 4/5.` …).
6. **Save draft** → "Draft saved."
7. **Submit to Sirius HR** → the dialog lists both employees and the figures → **Yes, submit to Sirius HR**. Expect "REF submitted to Sirius HR", status _With Sirius HR_, "Where this request is" at _Criterion 1 of 5_.
8. Mailpit: "REF submitted to Sirius HR" to `pf.alpha.hr@sirius.local` and "New increment request REF from SUB-A" to `pf.reviewers@sirius.local`.

Try to break it: an empty proposal or a criterion without a justification keeps **Submit** disabled with the reason shown; `150` as a percentage is refused.

## 3. Review, question and return (Sirius HR) — R1-07 … R1-10

Sign in as `pf.reviewer`.

1. The bell shows a new notification. Sidebar → **Review Queue**: both employees of REF under _To review_, with proposed %, criteria marks and waiting time; no salaries in the list.
2. Open **Aisha Rahman** → under each criterion **Mark verified** (C1 … C5). The Decision panel says "Verify 5 more criteria…" until all five are checked; then **Approve Aisha Rahman** → "Aisha Rahman approved." → **Next employee: Yusuf Karim**.
3. Yusuf: **Mark verified** C1 only. In _Questions and answers_ type `Is the 2026 appraisal signed?` → **Send**. The thread shows "Waiting for SUB-A".
4. Decision → **Return** tab → **Return Yusuf Karim** without a reason: refused ("Choose a reason and write a comment."). Reason **Missing evidence**, comment `Attach the signed 2026 appraisal for C1, and lower the proposal to 4%.` → **Return Yusuf Karim**. Expect "Yusuf Karim returned to Subsidiary A."
5. Request Tracker (Home): REF is _Returned_, with _Subsidiary_ in "With".

## 4. Answer and resubmit (subsidiary) — R1-08

Sign in as `pf.alpha.hr`.

1. Notifications: "Sirius HR asked a question about Yusuf Karim" and "Yusuf Karim returned" (both _Action needed_). Mailpit has the matching emails (they never contain the question or comment).
2. Sidebar → **Conversations** → _Waiting for you_ → **Respond about Yusuf Karim** → type `Yes — signed copy attached to C1.` → **Send** → "Waiting for Sirius HR".
3. Open REF: the banner "Sirius HR returned 1 employee to you" quotes the comment → **Update and resubmit**. Only Yusuf is editable; Aisha is locked.
4. Yusuf: proposal `4`; C1: attach `appraisal-2026-signed.pdf` (any PDF).
5. **Resubmit to Sirius HR** → note `Signed appraisal attached; proposal lowered to 4%.` → **Yes, resubmit** → "Resubmitted to Sirius HR."

## 5. Final decision (Sirius HR) — R1-09

Sign in as `pf.reviewer`.

1. Notifications: "SUB-A resubmitted 1 returned employee".
2. Review Queue → Yusuf: verification starts again ("Verify 5 more criteria…") → **Mark verified** C1 … C5.
3. Tick **Approve a different increment** → _Approved increment_ `3.5` → Reason **Budget** → comment `Within the 2026 budget band for G6.` → **Approve Yusuf Karim**. Expect "Every employee of REF is decided." and "Approved at 3.5% instead of 4%" (AED 588/month, new salary AED 17,388).
4. Home: REF _Approved_ · _Decided_ · _Closed_.

Then as `pf.alpha.hr`: REF shows "Final status: Approved"; Yusuf's page shows the reason _Budget_ and the comment. Mailpit: "REF decided: Approved".

## 6. History, reports and the audit trail — R1-14, R1-15

1. As `pf.alpha.hr`, open REF → **History**: newest first — "Yusuf Karim approved", "C5 verified for Yusuf Karim", "Returned employees resubmitted (1)", "Message about Yusuf Karim", "Yusuf Karim returned to the subsidiary", "Aisha Rahman approved", "Submitted to Sirius HR", file attachments, "Request created (2 employees)" — each with who and when.
2. Sidebar → **Reports**: Period _All periods_, search `REF` → "1 request · 2 employees match". **Download Excel**: `PeopleForge-RP-01-<date>.xlsx` with Summary, Requests (Approved, TAT in days) and Employees (Aisha 5% approved; Yusuf proposed 4%, approved 3.5%, increase 588). **Download PDF**: A4 landscape, same content, "Page 1 of 1".
3. As `pf.reviewer`, Reports also offers a _Subsidiary_ filter. Choose SUB-B: "Nothing to report".
4. As `pf.reviewer` (or `pf.admin`), **Audit trail** → search `report.downloaded`: one row per download, with format and filters, never the rows. Click **Only <name>** under a person → only that person's actions; **Show everyone** clears it. Try _From_/_To_ dates of today.
5. As `pf.admin`, **Reports** shows _Executive reports_ (coming with R2): an admin can't download pay data.

## 7. Analytics — R1-10 … R1-12

As `pf.reviewer`, sidebar → **Analytics**.

1. _Turnaround time_: cards (average TAT of decided requests, open requests and their age, longest open), _TAT by criterion_ (C1 … C5: verified count, average and longest days), _By subsidiary_, _Requests, longest first_ (REF with its TAT). Times are elapsed days with one decimal; a local run shows small values like `0.0 days`.
2. _Back-and-forth_: _Employees returned_ ≥ 1, _Questions asked_ ≥ 1, average answer time; REF listed with 1 return and its time with the subsidiary.
3. Filters: _Period_ and _Subsidiary_ (no search). **Download RP-02 (Excel)**: `PeopleForge-RP-02-<date>.xlsx`, six sheets (Summary with definitions; TAT by request, criterion, subsidiary; Back-and-forth by request and subsidiary).

## 8. Reminders — R1-13

Reminders are checked by the worker every 15 minutes (`REMINDER_INTERVAL_MS` in `apps/worker/.env`; set `60000` while testing and restart `pnpm dev`). Each is sent once per occasion. To make one due now, age a request in the local database (superuser, development only):

1. As `pf.alpha.hr`, create and submit a second request with **Mariam Saleh** (`5`%, criteria as in step 2); note **REF2**.
2. Waiting for review (to reviewers):

   ```bash
   docker exec -i sirius-local-postgres-1 psql -U postgres -d peopleforge -c \
     "UPDATE increments.increment_request SET submitted_at = now() - interval '3 days'
      WHERE id = (SELECT id FROM increments.increment_request
                   WHERE status IN ('submitted', 'under_review') AND deleted_at IS NULL
                   ORDER BY submitted_at DESC LIMIT 1)
      RETURNING reference;"
   ```

   This ages the most recently submitted request (REF2) and prints its reference; `UPDATE 0` means nothing is submitted and waiting. Within a minute `pf.reviewer` gets "1 employee from SUB-A has waited more than 2 days for review." (Action needed) and Mailpit "Reminder: REF2 from SUB-A is waiting for review". The Review queue shows Mariam under _Past reminder_.

3. Deadline (to whoever prepares a draft): as `pf.alpha.hr` start a draft with Mariam (don't submit), then

   ```bash
   docker exec -i sirius-local-postgres-1 psql -U postgres -d peopleforge -c \
     "UPDATE core.increment_cycle SET submission_deadline = (now() AT TIME ZONE 'Asia/Dubai')::date + 2;"
   ```

   `pf.alpha.hr` gets "Draft with 1 employee not submitted yet. Deadline: <date>." and the email "Reminder: submit … by <date>". Put the deadline back afterwards: `… SET submission_deadline = '2026-11-30';`.

4. As `pf.admin`, turn _Waiting for Sirius HR's review_ off: aged requests no longer remind.

## 9. Isolation and permissions — R1-01, NFR-SEC-01

Sign in as `pf.beta.hr`.

1. Home and Reports show none of Subsidiary A's requests; searching `REF` finds nothing.
2. Paste REF's address (copied from `pf.alpha.hr`'s browser) → **Page not found**. Same for `/review`, `/audit`, `/analytics` and `/settings`.
3. As `pf.reviewer`, `/settings` → **Page not found** (admins only); there is no New Request.

## 10. Arabic layout

On any page, switch the language to **العربية**: the page turns right-to-left (navigation on the right, chevrons mirrored, numbers and codes unchanged). Text stays English until Arabic translations are provided (change request).

## If something doesn't match

Note the page, the account, REF and the time, and the "reference" number shown on any error page (it matches the API log). Check `pnpm dev` output and Mailpit before raising a defect.
