# Current Migration State

**Updated**: 2026-08-25 (early) · **Phase**: EXECUTION · **Branch**: `dev`

## Standing user directives (valid across sessions)
1. Execute directly on branch `dev` (no dedicated refactor branch).
2. Autonomous `git commit` at every checkpoint once verify.sh gates pass (lint + tsc + vitest).
3. Never push without explicit request. Never touch user's uncommitted WIP without asking.
4. No Prisma schema changes this phase (R8).

## ENTRYPOINT FOR FRESH SESSIONS
Read this file → run Recovery Protocol (`PLAN.md` §23) → executable plan = `.spec/EXECUTION-PLAN.md`
(v2) → process rules = `.spec/PLAN.md` → evidence base = `.spec/context/system-discovery.md`.
Legacy fate table = `.spec/migrations/legacy-map.md`.

## Snapshot
- phase: **CP-2 (core) REACHED** — new TaskBoard live on /dashboard → next: **T2.7** component
  tests (board states, dialog validation, move-menu parity via MSW) + E2E drag/approve flows,
  then CP-2 final commit is already partially landed (see completed.md)
- epic/task in progress: E2 remaining: T2.7 tests; then E3 Work Sessions (T3.1 spec first)
- last completed: E2 core — spec, MSW handlers, hooks+move-rules (29 unit tests), board UI
  swap, legacy kanban chain deleted, D-17 (urgent priority) + D-18 (legacy statuses) fixed
- tests status: verify.sh GREEN; shell e2e 5/5; vitest 29/29 (incl. 14 move-rule tests)
- known failures: none open
- new discoveries: D-13 (NEXTAUTH_SECRET), D-14 (notifications PUT contract), D-15 (a11y
  inventory → E2 spec), D-16 (register alert), D-17 (urgent priority), D-18 (legacy statuses
  in live DB — wire normalization landed; cleanup migration PENDING USER DECISION)
- spec changes: ADR-006 revised; legacy-map updated (notification-context deleted; toast shim)
- next autonomous action: E2 closeout — browser E2E for move/approve flows (drag via Move menu
  + leader approve → points), then E3/T3.1 work-sessions spec. NOTE: MSW now listens in ALL
  vitest tests (setup.ts); component tests use NuqsTestingAdapter
- blocked: []

## Checkpoint log
| CP | Date | Commit | Contents |
|---|---|---|---|
| (pre) | 2026-08-24 | d875233 | user's temporal reports form |
| import→CP-0 | 2026-08-24 | d273773…698b2c4 | plan import, infra, foundation, Tailwind v4 port |
| CP-0.5 | 2026-08-24 | cd47958 | state reconstruction v2 (EXECUTION-PLAN, ADR-006/007, legacy-map) |
| E1-infra | 2026-08-25 | def5583 | route groups + server guard + boundaries + toast + fonts |
| **CP-1** | 2026-08-25 | (this commit) | nav single source, features/notifications, RHF+Zod auth pages, rbac contract test, axe gates, baseline-e1 (64 imgs) |

## Environment notes for next session
- Dev server: :3001 (docker prod build occupies :3000 — do NOT kill the container).
  playwright.config + capture/compare scripts target 3001. Start: `npx next dev -p 3001`.
- `.env` now includes NEXTAUTH_SECRET + NEXTAUTH_URL (:3001) — D-13 fix. `.env` is GITIGNORED;
  a fresh clone must recreate it (documented in .env.example).
- Visual baselines: `baseline-v3` (pre-v4, historical) + `baseline-e1` (post-shell, CURRENT
  reference). Compare: `node scripts/compare-visual-baseline.mjs baseline-e1 <new> 0.01`.
- Playwright chromium installed; MSW worker present; docker db healthy.
- Tailwind v4 active; `--font-mono` token available (JetBrains Mono) for E3 timer/ids.
