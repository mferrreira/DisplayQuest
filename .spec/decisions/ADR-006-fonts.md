# ADR-006 · Self-hosted variable fonts (Inter + JetBrains Mono) via @fontsource

**Status**: Accepted · **Date**: 2026-08-24

## Context
Discovery D-10: `app/globals.css` sets `body { font-family: Arial, Helvetica, sans-serif }` while
`.spec/design-system.md` declares Inter (sans) and JetBrains Mono (timers/code/ids). The runtime font
contradicts the documented design system, and mono has no runtime source at all despite timers/IDs
being core UI (floating session timer, kanban ids).

Options: (a) keep system stack and amend the spec; (b) `next/font/google` (downloads at build);
(c) self-hosted packages via @fontsource (bundled at install).

## Decision
Install `@fontsource-variable/inter` and a JetBrains Mono package, import in the root layout, and set
`--font-sans` / `--font-mono` in `globals.css` `@theme`. NOT next/font/google: the production image is
`output: standalone` and builds may run without network access; bundled fonts are offline-safe.

## Consequences
- Small bundle increase (~100–300KB variable fonts, subsetted latin).
- T1.6 lands this AFTER the CP-1 visual baseline capture? No — fonts change text metrics everywhere.
  Landing order: T1.6 happens BEFORE baseline recapture at CP-1 so the new baseline includes the final
  typography. Any screenshot diff at CP-1 must be explained by (a) route-group chrome changes or
  (b) font swap — nothing else.
- Future palette/typography tweaks happen as tokens-only commits.
