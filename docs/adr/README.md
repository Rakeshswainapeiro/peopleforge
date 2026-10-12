# Architecture Decision Records

Significant technical decisions, one file each: context, decision, alternatives, consequences. Never edit an accepted ADR's decision — supersede it with a new one.

| ADR                                                   | Title                                                   | Status                                 |
| ----------------------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| [0001](0001-technology-stack-and-repository.md)       | Technology stack and repository structure               | Proposed                               |
| 0002                                                  | Data model, ORM and Row-Level Security                  | Planned (design proposal for go-ahead) |
| [0003](0003-authentication-session-and-api-tokens.md) | Authentication: web session (BFF) and API access tokens | Proposed (Entra ID pending A6)         |
| 0004                                                  | Assumed volumes and load targets                        | Planned                                |
| [0005](0005-nestjs-api-and-access-policy.md)          | NestJS for the API, and a deny-by-default access policy | Accepted                               |
| 0006                                                  | TAT measurement: calendar vs business hours             | Planned (needs Sirius HR input)        |
| [0007](0007-shared-platform-packages.md)              | Shared `@sirius/*` packages from js-platform            | Accepted (production registry: A6)     |
