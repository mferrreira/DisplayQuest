# Current Migration State

**Updated**: 2026-08-24 (evening) · **Phase**: EXECUTION · **Branch**: `dev`

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
- phase: CP-0 verified in-tree → CP-0.5 (state reconstruction v2) landing now
- epic/task in progress: E0 → next: **E1 Shell & Auth**, starting T1.1 (basename eslint overrides
  BEFORE route-group moves; D-9 gotcha)
- last completed: v2 re-planning (Master Plan EXECUTION-PLAN.md; ADR-006 fonts; ADR-007 stash dropped)
- tests status: verify.sh GREEN pre-E0 (re-run at CP-0.5); DB healthy via docker-compose
- known failures: none open. 5 legacy files carry scoped lint warnings (backlog B-1).
- discoveries: D-1…D-9 restored from prior session; D-10…D-12 added by v2 planning (discoveries.md)
- spec changes: constitution amended A1–A4 (v2); EXECUTION-PLAN.md supersedes old PLAN.md-as-plan;
  METHODOLOGY.md removed (PLAN.md holds the methodology role)
- next autonomous action: E1/T1.1 — convert .eslintrc overrides to basename matching, then create
  route groups (auth)/(dashboard), move pages, URLs unchanged
- blocked: []

## Checkpoint log
| CP | Date | Commit | Contents |
|---|---|---|---|
| (pre) | 2026-08-24 | d875233 | user's temporal reports form |
| import | 2026-08-24 | d273773 | plan package import + Phase −1 re-baseline + ADRs 001–005 |
| infra | 2026-08-24 | e3f86c4 | deps + eslint + vitest/playwright/msw + verify.sh |
| foundation | 2026-08-24 | 343d3c8 | entities + typed api + query keys/provider |
| CP-0 | 2026-08-24 | 698b2c4+ | Tailwind v4 port pixel-identical + baseline tooling |
| reset | 2026-08-24 | (working tree) | .spec wiped by user except methodology; v2 re-planning done |
| **CP-0.5** | 2026-08-24 | (this commit) | state reconstruction: KB restored+patched, EXECUTION-PLAN v2, ADR-006/007, legacy-map |

## Environment notes for next session
- Dev DB: docker-compose (`display-quest-db`, healthy). If verify.sh fails on round-trip test: DB down
  → `open -a Docker && docker-compose up -d` then retry (R11).
- Visual baselines gitignored at `tests/e2e/__screenshots__/baseline-v3` (pre-v4 switch, still valid
  for token regression). Recapture as baseline-e1 AFTER shell changes at CP-1.
  Capture: `node scripts/capture-visual-baseline.mjs <name> 3000` (login coordenador@lab.com / 123);
  compare: `node scripts/compare-visual-baseline.mjs <a> <b> 0.01`.
- Playwright chromium installed; MSW worker at public/mockServiceWorker.js.
- Tailwind v4 active (`@theme inline` in globals.css); tailwind.config.ts deleted (ADR-005).
- `stash@{0}` was DROPPED per user decision (ADR-007) — do not hunt for it.
