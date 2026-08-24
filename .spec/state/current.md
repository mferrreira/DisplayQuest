# Current Migration State

**Updated**: 2026-08-24 · **Phase**: 0 COMPLETE (CP-0) · **Branch**: `dev`

## Standing user directives (valid across sessions — set 2026-08-24)
1. Execute directly on branch `dev` (no dedicated refactor branch).
2. Autonomous `git commit` at every checkpoint once verify.sh gates pass (lint + tsc + vitest).
3. Never push without explicit request. Never touch the user's uncommitted work without asking.
4. User's own WIP found in the tree: ask before stashing/committing (first time, they committed
   it themselves mid-session; second time, they asked for a stash — default to ASKING).

## ENTRYPOINT FOR FRESH SESSIONS
Read this file → run the Recovery Protocol (METHODOLOGY.md §23) → executable plan = `.spec/PLAN.md`
→ process rules = `.spec/METHODOLOGY.md` → evidence base = `.spec/context/system-discovery.md`.

## Snapshot
- phase: CP-0 reached — foundation green, Tailwind v4 port pixel-identical
- epic/task in progress: none (between phases) → next: **E1 Shell & Auth** (T1.1 route groups)
- last completed: T0.7 Tailwind v3→v4 port with 64/64 screenshot parity (0.000% diff)
- tests status: verify.sh GREEN (lint pass, tsc clean, vitest 10/10 incl. DB round-trip)
- known failures: none open. Pre-existing lint violations in 5 legacy files neutralized as
  scoped warnings (see backlog B-1) — global rules remain errors.
- new discoveries: D-1…D-8 (discoveries.md)
- spec changes: design-system.md re-baselined; product-model.md purchase lifecycle patched (D-8);
  api-contracts.md gained REAL WIRE SHAPES appendix
- next autonomous action: E1/T1.1 — RESUME FROM STASH (git stash pop; see D-9 for the lint-override path gotcha); then route groups + T1.2
  server layout guard via getServerSession (additive); write .spec/tasks/E1 gates first
- blocked: []

## Checkpoint log
| CP | Date | Commit | Contents |
|---|---|---|---|
| (pre) | 2026-08-24 | d875233 | user's temporal reports form (theirs) |
| import | 2026-08-24 | d273773 | plan package import + Phase −1 re-baseline + ADRs 001–005 |
| infra | 2026-08-24 | e3f86c4 | deps + eslint + vitest/playwright/msw + verify.sh |
| foundation | 2026-08-24 | 343d3c8 | entities + typed api + query keys/provider |
| **CP-0** | 2026-08-24 | (this commit) | Tailwind v4 port + visual baseline tooling + lint debt scoping |

## Environment notes for next session
- Dev DB: docker-compose (display-quest-db). Docker Desktop crashed once mid-session; restart via
  `open -a Docker && docker-compose up -d`, then `npm run dev`.
- Visual baselines live in `tests/e2e/__screenshots__/` (gitignored, 8.7MB). Regenerate:
  `node scripts/capture-visual-baseline.mjs <name> 3000` (login: coordenador@lab.com / 123).
  Compare: `node scripts/compare-visual-baseline.mjs <a> <b> 0.01`.
- Playwright browsers installed (chromium). MSW worker generated at public/mockServiceWorker.js.
- components.json updated for v4 (no tailwind config path). tailwind.config.ts DELETED — tokens
  now bridge via `@theme inline` in app/globals.css (values untouched, ADR-005).
