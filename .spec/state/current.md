# Current Migration State

**Updated**: 2026-08-24 · **Phase**: 0 (Foundation) · **Branch**: `dev`

## Snapshot
- phase: Phase −1 DONE → Phase 0 in progress
- epic/task in progress: T0.1 state+ADRs (this file) → next T0.2 deps
- last completed: Phase −1 re-baseline (see discoveries D-1…D-7); plan package imported into `.spec/`
- tests status: none exist yet (T0.3 pending). `npx tsc --noEmit` clean. lint NOT RUNNABLE (D-4 — fix first in T0.2).
- known failures: ESLint absent (no dep, no config, interactive prompt hang)
- new discoveries: D-1…D-7 in discoveries.md
- spec changes: design-system.md re-baselined to user's landed HSL tokens; oklch palette removed; T0.7 redefined as mechanical port
- next autonomous action: T0.2 install deps one-by-one (start with eslint tooling to unblock verify gate), tsc after each
- blocked: [] (none)

## Open product defaults in force (from PLAN.md — silent unless overridden)
Q1 all-visible-tasks dashboard · Q2 pt-BR slugs · Q3 mobile kanban horizontal scroll · Q4 notifications refetchInterval 60s · Q5 no i18n

## Checkpoint log
| CP | Date | Commit | Contents |
|---|---|---|---|
| (pre) | 2026-08-24 | d875233 | user's temporal reports form (theirs, not ours) |
