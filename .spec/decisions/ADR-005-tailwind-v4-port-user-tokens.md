# ADR-005 · Tailwind v4 = mechanical port of user's landed tokens

**Status**: Accepted · **Date**: 2026-08-24

## Context
Runtime is Tailwind v3.4 (`tailwind.config.ts` + HSL vars in globals.css). The planning palette
(oklch) was provisional; the user's own dark-mode/token refactor landed on `dev` (commit 69529d4)
with a coherent system: blue primary family, success/warning/info, blue-tinted dark neutrals
(hue 222 elevation scale).

## Decision
T0.7 ports **exactly the user's landed values** to Tailwind v4 `@theme` (see re-baselined
`.spec/design-system.md` table). NOT a re-design. Playwright screenshot baseline captured BEFORE
the switch; migration proceeds family-by-family with visual diff against baseline (risk R2).

## Consequences
- Zero intended visual change at T0.7; diffs beyond noise = regression to fix before proceeding.
- `tailwindcss-animate` replaced by native keyframes; `components.json` updated for v4 paths.
- Any future palette change happens as tokens-only commit after this port.
