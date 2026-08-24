# Completed (append-only)

## 2026-08-24 · Phase −1 · RE-BASELINE ✅
- Plan package imported into `.spec/` (PLAN.md=METHODOLOGY source, EXECUTION-PLAN→PLAN.md, spec/*, context/).
- git clean on `dev` (user committed own WIP d875233 before start).
- Re-probe vs system-discovery baselines: drift = D-1 timer path, D-2 dark-mode-spec gone, D-6 anchor shifts.
- Landed tokens adopted: design-system.md patched (table of light/dark HSL + v4 target form).
- `prisma migrate status` up to date; no new migrations.
- Exit gate: `npx tsc --noEmit` PASS. Lint impossible (D-4) — accepted as recorded failure, fix is first T0.2 item.

## 2026-08-24 · Phase 0 · FOUNDATION ✅ (CP-0)
- T0.2 deps one-by-one, tsc green after EACH (caught real peer-dep trap: @testing-library/dom).
- T0.3 vitest4+jsdom+RTL16 / playwright / msw2 (node+browser) / verify.sh — smoke green.
- T0.4 entities/ Zod mirroring schema.prisma; round-trip vs LIVE DB 9/9 → caught D-8 purchase
  status drift; task wire shape corrected to assigneeIds (toJSON source).
- T0.5 lib/api/client.ts (ApiError, z.output, no silent unwrap) + endpoints: tasks,
  work-sessions({data} envelope), projects, users, notifications; REAL SHAPES appendix.
- T0.6 queryKeys factory + QueryProvider (staleTime 5m, no 4xx retry) mounted in client-layout.
- T0.7 Tailwind v4.3.3 port: @theme inline bridge over untouched HSL vars, @custom-variant dark,
  tw-animate-css replaces tailwindcss-animate, tailwind.config.ts deleted, components.json updated.
  Baseline v3 captured BEFORE switch (64 imgs = 8 routes × 320/768/1024/1440 × light/dark);
  after-v4 compared: **64/64 at 0.000% pixel diff**. Chrome manual pass: dashboard renders, 0 console errors.
- Lint debt: 5 legacy files scoped to warn (rules-of-hooks, unescaped entities) — backlog B-1.

## 2026-08-24 · CP-0.5 · STATE RECONSTRUCTION (v2) ✅
- KB restored from git history (git checkout) + patched: status headers on architecture.md /
  system-discovery.md; PLAN.md = methodology; METHODOLOGY.md removed (role merged).
- EXECUTION-PLAN.md v2 written (task graph E0–E10, gates, risks R11–R13, defaults).
- Constitution amended A1–A4 (UI-state grid, public-API cross-feature rule, AlertDialog rule,
  standing directives) — approved via Master Plan v2 execution instruction.
- ADR-006 fonts (self-hosted @fontsource; fixes D-10 Arial-vs-Inter gap).
- ADR-007 E1 stash DROPPED per user decision; rebuild fresh.
- migrations/legacy-map.md created — every legacy artifact mapped to fate + owning epic.
- Discoveries appended: D-10 font gap, D-11 DB-dependent vitest, D-12 stray project-members endpoint.
- Backlog extended (knip@E10, kanban_boards probe@E2).
