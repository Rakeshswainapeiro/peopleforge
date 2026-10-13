# ADR-009: PeopleForge design system package (`@peopleforge/ui`)

- **Status:** Accepted (2026-10-13)
- **Requirements:** NFR-USA-01 (task completion with under an hour of training), NFR-BRW-01; R1-06 (status never shown by colour alone); internal standards: WCAG 2.1 AA, RTL readiness
- **Related:** ADR-001 (stack), ADR-007 (shared `@sirius/*` packages), `docs/design/design-system.md`

## Context

The Figma screens repeat the same parts: dark sidebar, page header, stat cards, status badges, tables with pagination, filters, alerts, criteria cards and progress bars. Building each screen with its own Tailwind classes would drift from the Figma and from itself. It would also scatter hover, focus, cursor and transition behaviour, and a palette change would mean editing every page.

## Decision

1. **One package, `packages/ui` (`@peopleforge/ui`).** It holds the Figma tokens and the components; screens compose them and add no visual styling of their own beyond layout.
2. **Tokens as a Tailwind v4 theme** (`packages/ui/src/theme.css`): colours, radii, shadows and easing are named for their role (`bg-surface`, `text-ink-muted`, `bg-brand-600`, `bg-danger-50`). The web app imports it once in `globals.css`.
3. **Components are presentational and server-component safe.** They hold no state or data fetching, and render the text they are given, so i18n stays in the app. Links are injected (`as={Link}`) so the package doesn't depend on Next.js.
4. **Interaction is built in.** Every interactive component carries:
   - a pointer cursor, and a not-allowed cursor when disabled;
   - hover and active states;
   - a 150 ms transition on the standard easing;
   - one visible keyboard focus ring.

   Reduced-motion preferences switch transitions off.

5. **Accessibility and RTL are built in.**
   - Logical properties only, enforced by a shared lint rule.
   - Directional icons mirror in RTL.
   - Fields wire label, hint and error with ids.
   - Badges always carry text, and pass/fail badges add an icon.
6. **Tested like code.** Each component has unit tests under the 100% coverage gate.

## Alternatives

- **Component library (MUI, Chakra, Mantine).** Rejected: heavy runtime CSS-in-JS conflicts with the nonce CSP, and matching the Figma means overriding most of it.
- **Headless primitives (Radix) plus our styles.** Good for complex widgets (combobox, dialog, menu). We'll add them per component when a slice needs one, behind the same `@peopleforge/ui` API.
- **Put it in js-platform now.** Deferred: DealForge has its own brand. Once a second app shares components, the brand-neutral parts move to `@sirius/ui` with tokens per app (ADR-007 process).

## Consequences

- New screens are mostly composition, and visual changes happen in one place.
- The web app's Tailwind must scan the package's `dist` (`@source` in `globals.css`). A component class that appears only in `src` won't render until the package is rebuilt; `pnpm dev` rebuilds it in watch mode.
- Inter (the Figma typeface) isn't bundled yet. The stack falls back to system UI fonts until the font files are supplied and self-hosted (no font CDN).
