# Architecture Decision Records

Significant technical decisions, one file each: context, decision, alternatives, consequences. Never edit an accepted ADR's decision — supersede it with a new one.

| ADR                                                          | Title                                                                  | Status                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------- |
| [0001](0001-technology-stack-and-repository.md)              | Technology stack and repository structure                              | Proposed                            |
| [0002](0002-data-model-and-row-level-security.md)            | Data access, migrations and Row-Level Security                         | Accepted                            |
| [0003](0003-authentication-session-and-api-tokens.md)        | Authentication: web session (BFF) and API access tokens                | Proposed (Entra ID pending A6)      |
| 0004                                                         | Assumed volumes and load targets                                       | Planned                             |
| [0005](0005-nestjs-api-and-access-policy.md)                 | NestJS for the API, and a deny-by-default access policy                | Accepted                            |
| [0006](0006-tat-measurement.md)                              | Measuring TAT and back-and-forth (elapsed days; calendar to confirm)   | Accepted (calendar: Q6)             |
| [0007](0007-shared-platform-packages.md)                     | Shared `@sirius/*` packages from js-platform                           | Accepted (production registry: A6)  |
| [0008](0008-salary-field-encryption.md)                      | Field-level encryption of salary and increment amounts                 | Accepted                            |
| [0009](0009-design-system-package.md)                        | PeopleForge design system package (`@peopleforge/ui`)                  | Accepted                            |
| [0010](0010-evidence-storage-scanning-and-downloads.md)      | Evidence files: private storage, scan first, downloads through the API | Accepted (products: A6)             |
| [0011](0011-audit-trail-status-history-and-notifications.md) | Audit trail, status history and notifications (append-only, outbox)    | Accepted (email provider: A6)       |
| [0012](0012-email-worker-and-outbox-delivery.md)             | Email worker: outbox delivery without a queue server                   | Accepted (email provider: A6)       |
| [0013](0013-review-decisions-and-returns.md)                 | Sirius HR's review: verification, decisions per employee, returns      | Accepted (reason lists: to confirm) |
| [0014](0014-settings-and-reminders.md)                       | Settings: versioned criteria and reminders on configured triggers      | Accepted (default days: to confirm) |
| [0015](0015-group-data-versions-and-anomaly-flags.md)        | Group employee data: uploads, versions, aggregates and anomaly flags   | Accepted (fields A3, Palm HR A7)    |
| [0016](0016-criteria-add-remove-and-thresholds.md)           | Criteria: adding, removing and thresholds on measured values           | Accepted (real criteria A1)         |
