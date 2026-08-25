# Current Migration State

**Updated**: 2026-08-25 (late) · **Phase**: EXECUTION · **Branch**: `dev`

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
- phase: **E2 FULLY COMPLETE → next E3 (Work Sessions)** — TaskBoard live with E2E flows
  and component tests. CP-2 is reached. E3 starts with T3.1 spec.
- epic/task in progress: E3 Work Sessions — T3.1 spec (lifecycle, pause/resume race,
  reconnect, auto-pause@3600s, log-on-end)
- last completed: E2 closeout — T2.7 E2E (5 flows: columns, move, approve+points badge,
  URL filter round-trip, keyboard move); bug fixes for live points refresh and status default
- tests status: vitest 32/32, shell+task-board e2e 10/10; lint clean; tsc pre-existing
  .next/types RouteContext mismatch (same on clean tree — Next.js 15 type-gen lag, not caused by changes)
- known failures: pre-existing tsc .next/types error (ignore for now)
- new discoveries: D-13..D-19 (D-19: backend single-create missing status default, frontend fixed)
- spec changes: ADR-006 revised; legacy-map updated (notification-context deleted; toast shim)
- next autonomous action: **T3.1** — write work-sessions spec in `.spec/specs/work-sessions.feature.md`
  (per EXECUTION-PLAN.md: lifecycle active↔paused↔completed; pause/resume race;
  reconnect; auto-pause@3600s dialog; log-on-end)
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
