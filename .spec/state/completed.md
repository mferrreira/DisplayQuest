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

## 2026-08-25 · CP-1 · E1 SHELL & AUTH ✅
- T1.1 basename eslint overrides BEFORE moves; route groups (auth)/(dashboard); URLs unchanged.
- T1.2 server guard (dashboard)/layout.tsx — /dashboard 307s to /login unauthenticated (e2e-proven).
- T1.3 error/global-error/not-found (pt-BR); use-toast → sonner shim; FIXED latent bug: radix
  <Toaster/> was only mounted in loja so 17 call sites had invisible toasts; radix primitives deleted.
- T1.4 nav single source (components/layout/nav-config.ts) consumed by header+mobile-menu; killed
  2× all-users fetches (session-derived points); ModernButton→Button; proper pt-BR accents.
- T1.4b features/notifications (query hooks, 60s poll, optimistic read/delete) rewired into
  NotificationsPanel; legacy notification-context DELETED; endpoint contract corrected (D-14).
- T1.5 login/register RHF+Zod (inline errors, aria-invalid/describedby, autoComplete); alert()→sonner.
- T1.6 ADR-006 revised: Inter already via next/font (D-10 premise corrected); JetBrains Mono token
  added (--font-mono); dead Arial rule removed.
- T1.7 tests/unit/rbac-contract.test.ts (shared-map equality, GERENTE tripwire, helpers).
- Gates: verify.sh GREEN; shell.spec 5/5 (incl. axe login + axe dashboard-header); vitest 15/15.
- baseline-e1 captured (64 imgs, :3001) — visual review: header/nav/points/dark/mobile OK.
  Legacy board observations → E2 (action row overflows 320px; saturated column headers; D-15 items).

## 2026-08-25 · E2 foundation (T2.1–T2.3) ✅
- T2.1 .spec/specs/task-board.feature.md — full spec: permission matrix (gateway line-cited),
  lifecycle × visibility, per-user progress on public tasks, penalty mirror, drag rules,
  state grid, D-15 a11y obligations as AC, responsive fixes (320px overflow), test scenarios.
- T2.2 MSW task handlers from route source (list w/ projectId quirk, create/backlog, complete
  status semantics :401, approve/reject in-review guard + FIX line, delete) + board fixture
  factory (visibility×status×overdue×archive matrix) + in-memory store helpers.
- T2.3 features/tasks: useTasks/useTaskMutations (snapshot rollback onMutate/onError,
  invalidation: tasks.all+users.all+notifications.all), pure move-rules (resolveMove,
  optimisticStatusFor, archive, overdue, penalty, backlog parser) + 14 unit tests.
- D-17: entities priority enum missed 'urgent' (backend Task.ts declares it) — fixed.

## 2026-08-25 · CP-2 (core) · E2 TASKS/KANBAN — board swapped ✅
- T2.4 NEW TaskBoard container (nuqs URL filters projeto/atrasadas/busca/visao, skeleton/error/
  empty/filtered-empty states, archive section, DnD via resolveMove) + BoardColumn/BoardToolbar
  (contrast fix D-15.3, 320px wrap fix) + TaskCard (grip handle = only DnD handle; ALL controls
  labeled; progressbar aria; Move menu = T2.5 keyboard parity; reject prompt()→AlertDialog A3).
- T2.6 TaskDialog (RHF+Zod, global-quest gating), TaskDetailDialog (FIX blocks, approve/reject/
  delete w/ AlertDialog), BacklogDialog (parser-based, live count).
- Seed hooks: features/projects (E4 seed), features/users (E8/E9 seed).
- T2.8 SWAP: /dashboard renders TaskBoard; legacy kanban chain DELETED (board/column/card/compact/
  header/detail-dialog); task-dialog+backlog-dialog retained (project-detail-dialog consumers → E4).
- D-18 found+fixed (wire normalization); NuqsAdapter mounted (was missing — caught by new error.tsx).
- Gates: tsc clean, vitest 29/29, shell e2e 5/5, visual review of new board (screenshot OK).

## 2026-08-25 · E2/T2.7 (part) ✅
- TaskBoard component tests (MSW-backed): column distribution + archive section, filtered-empty
  round-trip, non-leader done-block rule through real menu UI (store assertion: no mutation).
- INFRA FIX: tests/setup.ts now starts MSW node server (was never listening — component fetches
  leaked to the docker container and 401'd); lib/api/client.ts resolves fetch against
  window.location.origin (Node fetch cannot parse relative URLs).
- vitest 32/32; shell e2e 5/5; tsc clean.

## 2026-08-25 · E2/T2.7 (E2E closeout) ✅
- Created `tests/e2e/helpers.ts` — shared `login(page)` + `apiSession(request)` helpers.
- Created `tests/e2e/task-board.spec.ts` — 5 serial E2E flow tests:
  1. Board renders all five lifecycle columns.
  2. Delegated task moved via Move menu lands in Em Revisão (server-truth verify).
  3. Leader approves → card reaches Concluído → header points badge increments.
  4. URL filter round-trip: busca drives filtered state, clear restores, deep link reproduces.
  5. Keyboard-only Move menu to Ajustes, fixture cleanup, points restore.
- Bug fix: `use-tasks.ts` now calls `session.update()` (next-auth `update()`) on complete/approve
  onSettled → live points badge refresh. Authority: lib/auth/config.ts :92-115.
- Bug fix: `task-dialog.tsx` now sends `status: "to-do"` on create (D-19: backend single-create
  route lacks default status — Prisma arg validation fails without it; backlog branch has it).
- DB residue: 0 fixture rows after all runs (afterAll safety net).
- Gates: vitest 32/32, shell+task-board e2e 10/10. Lint clean. TSC pre-existing .next/types
  RouteContext mismatch (same on clean tree — Next.js 15 params Promise<> type-gen lag).
