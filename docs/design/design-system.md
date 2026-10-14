# Design system (`@peopleforge/ui`)

Source of truth for how PeopleForge looks and behaves: the Figma "Dashboard" frames, captured as tokens and components in `packages/ui`. Decision: [ADR-009](../adr/0009-design-system-package.md).

## Rules for screens

1. **Compose; don't restyle.** A page uses components from `@peopleforge/ui` and adds only layout (grid, gaps, widths). If you need a new look, add or extend a component.
2. **Tokens only.** Use theme colours (`text-ink-muted`, `bg-surface`, `border-line`, `bg-brand-600` …), never raw Tailwind palettes (`slate-*`, `sky-*`) or hex values.
3. **Every clickable thing:**
   - pointer cursor;
   - hover and active states;
   - a 150 ms transition;
   - a visible focus ring (`focusRing`).

   Components do this already. Use `buttonClasses()` for links that look like buttons.

4. **Logical direction only:** `ms-/me-/ps-/pe-/start-/end-`. Lint fails on `ml-`, `left-`, `text-left` and similar.
5. **Text comes from `messages/*.json`.** Components take strings as props.
6. **Never colour alone** (R1-06): badges have text, and pass/fail adds an icon.

## Tokens (`packages/ui/src/theme.css`)

| Token                                     | Value                             | Used for                                 |
| ----------------------------------------- | --------------------------------- | ---------------------------------------- |
| `canvas`                                  | `#f2f3f5`                         | Page background                          |
| `surface` / `surface-muted`               | `#ffffff` / `#f7f8fa`             | Cards, inputs / row hover, subtle panels |
| `line` / `line-strong`                    | `#e4e6eb` / `#cfd3da`             | Dividers / control borders               |
| `ink` / `ink-muted` / `ink-subtle`        | `#111318` / `#5d6470` / `#8a909b` | Text: primary / secondary / meta         |
| `sidebar`, `sidebar-ink`, `sidebar-muted` | `#0b0b0b`, `#e8e8e8`, `#9a9a9a`   | Dark rail                                |
| `accent`                                  | `#5db563`                         | "Forge", shield mark, avatar             |
| `brand-50…700`                            | `#eef0fe` … `#3f47c9`             | Primary actions, links, Approved, info   |
| `success-50/600/700`                      | `#ebf6ec` / `#3e7d44` / `#2f6534` | Pass, approved banner                    |
| `danger-50/200/600/700`                   | `#fdeeed` … `#8b2a22`             | Fail, Rejected, errors                   |
| `warning-50/200/700`                      | `#fef8ee` / `#f6dcae` / `#a86400` | Action needed, incomplete criteria       |
| `radius-control` / `radius-card`          | 6 px / 10 px                      | Buttons, inputs / cards                  |
| `shadow-card` / `shadow-raised`           | hairline / soft                   | Resting cards / floating elements        |
| `ease-standard`                           | `cubic-bezier(0.2, 0, 0, 1)`      | All transitions (150 ms)                 |

The hex values were sampled from the Figma exports. Replace them with the Figma variables if the file defines them; it's a one-file change.

## Components → Figma

| Component                                                | Figma usage                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Wordmark`, `BrandMark`, `NavItem`, `Avatar`             | Sidebar: logo, Home / New Request / Notifications / Reports, user block                                                                                                                          |
| `PageHeader`                                             | Eyebrow, page title, description, header actions ("+ New increment request", "Save draft")                                                                                                       |
| `Button`, `ButtonLink`, `buttonClasses`                  | primary (Submit to Sirius HR), secondary (Back, View), outline (Respond, View Status, + Add), success/danger (Pass/Fail toggles)                                                                 |
| `StatCard`                                               | Drafts / With Sirius HR / … ; Current salary / Proposed / New salary / Criteria passed                                                                                                           |
| `Alert`                                                  | Waiting for Sirius HR (info), Increment approved (success), rejected (danger), Needs your action (warning)                                                                                       |
| `Badge`                                                  | Submitted (neutral), Draft (outline), Under review (info), Partly approved (info-outline), Approved (brand), Rejected (danger-solid), Pass/Fail (success/danger + icon), Action needed (warning) |
| `Card`, `CardHeader`, `CardBody`                         | Every white panel                                                                                                                                                                                |
| `Table`, `THead`, `TBody`, `Tr`, `Th`, `Td`, `CellStack` | Request and employee lists, eligibility criteria table                                                                                                                                           |
| `Pagination`                                             | Table footer (rows per page, page x of y, first/prev/next/last)                                                                                                                                  |
| `ToggleGroup` (`segmented` / `pills`)                    | By request / By employee; All / Unread / Action needed                                                                                                                                           |
| `Field`, `Input`, `Select`, `Textarea`                   | Search, Period, Status, Justification, Value                                                                                                                                                     |
| `ProgressSteps`                                          | Progress: Added → Submitted → Review → Decision                                                                                                                                                  |
| `EmptyState`, `Spinner`, `Skeleton`                      | Empty lists, loading                                                                                                                                                                             |
| `SegmentedChoice`                                        | "% \| AED" proposed-as switch (native radios)                                                                                                                                                    |
| `CriteriaProgress`                                       | Criteria cell: ✓ / ✗ / ○ per criterion and "n/5 complete" (request table, dashboard by employee)                                                                                                 |
| `Icon`                                                   | Outline icon set (24 px grid), directional ones mirror in RTL                                                                                                                                    |

Still to build, as their slices need them:

- Criteria card (pass/fail toggle, justification, evidence) and file attach: S3.
- Employee picker (combobox, with a headless primitive): S2.
- Dialog / confirm.
- Toast.

## Adding a component

1. Create it in `packages/ui/src/components/`, with variants in a `Map` or `switch` (no object-key lookups).
2. Use `transition` and `focusRing` from `lib/focus.ts` on anything interactive.
3. Write tests in the same change, under the 100% gate: roles and names, states, variants.
4. Export it from `src/index.ts` and add a row to the table above.

## Assets still needed

| Asset                                                         | Placeholder                               |
| ------------------------------------------------------------- | ----------------------------------------- |
| Inter font files (Figma typeface), WOFF2, licence             | System UI font stack                      |
| Logo as SVG from the brand team                               | Shield mark redrawn in code (`BrandMark`) |
| Figma colour variables (exact values)                         | Sampled hex values above                  |
| User photos (if Sirius wants them; needs Graph access agreed) | Initials avatar                           |
