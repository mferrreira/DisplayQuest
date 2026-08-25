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
- phase: **CP-1 REACHED** (E1 Shell & Auth complete) → next: **E2 Tasks/Kanban**, starting T2.1
  (write `.spec/specs/task-board.feature.md`; MUST encode D-15 a11y obligations 1–4)
- epic/task in progress: none (between epics)
- last completed: E1 — T1.1 route groups (eslint basename fix first), T1.2 server guard,
  T1.3 error boundaries + sonner toast consolidation (17 invisible-toast call sites FIXED),
  T1.4 nav single source + header refactor (no all-users fetch; session-derived points),
  T1.4b features/notifications (typed endpoints fixed per D-14: PUT markAsRead contract),
  T1.5 login/register RHF+Zod (register alert() → sonner), T1.6 fonts (ADR-006 revised:
  Inter already via next/font; added JetBrains Mono token; dead Arial rule removed),
  T1.7 rbac contract test
- tests status: verify.sh GREEN; shell e2e 5/5 (server-guard, login round-trip, board render,
  axe login, axe dashboard-shell); vitest 15/15 (10 + 5 rbac)
- known failures: none open
- new discoveries: D-13 (NEXTAUTH_SECRET missing in dev .env — masked by port-shared cookies),
  D-14 (notifications endpoint contract was WRONG in foundation: PATCH→PUT action:markAsRead),
  D-15 (dashboard a11y inventory → E2 spec obligations)
- spec changes: ADR-006 revised; legacy-map updated (notification-context deleted; toast shim)
- next autonomous action: E2/T2.1 — write task-board.feature.md spec, then T2.2 MSW handlers
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
