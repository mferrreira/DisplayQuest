# DisplayQuest Frontend Refactor — Executable Plan

**Version**: 1.0 · **Created**: 2026-08-24 · **Status**: AWAITING_EXECUTION

**Process methodology**: `PLAN.md` (this folder) governs *how* to operate. This file is the project-specific *what/when/in-what-order*.
**Knowledge base** (import into repo at T0.1):
- `spec/constitution.md` — binding principles
- `spec/product-model.md` — domain entities & state machines
- `spec/architecture.md` — as-is audit + to-be target
- `spec/api-contracts.md` — endpoint inventory
- `spec/ux-model.md` — personas, IA, screen-state grids
- `spec/design-system.md` — tokens/components/a11y (**⚠ partially stale — see Phase −1**)
- `spec/state-management.md` — TanStack Query/Zustand/nuqs full patterns
- `context/system-discovery.md` — evidence-backed autopsy snapshot (`file:line`) so no agent re-does discovery from scratch

---

## How to resume execution (fresh agent)

1. Copy this folder's contents into the repo: `spec/*` → `<repo>/.spec/`, this file → `<repo>/.spec/PLAN.md`, keep `context/` alongside.
2. Execute **Phase −1 → Phase 0 → Task Graph**, updating `<repo>/.spec/state/current.md` at every checkpoint.
3. Run the Recovery Protocol (bottom of this file) at the start of EVERY session.

## Preconditions

- User's light refactoring (dark-mode / design-token pass on branch `dev`, ~62 files incl. `globals.css`,
  `tailwind.config.ts`, many components, plus a `migration.sql` + seeds) is **merged** and the working tree is **clean**.
- If that refactor is NOT yet merged when execution starts: STOP, record BLOCKED in state, do not proceed on a dirty tree.

---

## PHASE −1 — RE-BASELINE (mandatory first; repo may have drifted since planning)

The planning autopsy was performed BEFORE the user's refactoring. Verify nothing material changed:

1. `git status --short` must be clean. Note branch.
2. Re-probe and compare against baselines recorded in `context/system-discovery.md`. Any mismatch = discovery entry + spec patch.
3. Read final `app/globals.css` + `tailwind.config.ts` from the USER's refactor. **Adopt their landed
   tokens** (`success/warning/info`, blue primary, blue-tinted dark neutrals) as the color BASELINE.
   Patch `spec/design-system.md`: replace provisional oklch values with their HSL values; KEEP the
   Tailwind v4 `@theme` migration goal — T0.7 becomes "port user's tokens to v4", NOT "impose planned palette".
4. Inspect `dark-mode-spec/` folder in-repo; fold still-relevant decisions into design-system.md, mark folder legacy in backlog.
5. The user's diff touched `prisma/migration.sql` + seeds → run `npm run db:migrate:status`; if drift, record discovery before any DB-dependent work.
6. If any of the 13 contexts were deleted/renamed by the refactor, update architecture.md §problems and adjust cleanup tasks.
7. Exit gate: `npx tsc --noEmit && npm run lint` both pass post-refactor.

---

## PHASE 0 — PERSIST PROJECT STATE & FOUNDATION

```
T0.1 Import this folder into repo (.spec/), init state/{current,completed,blocked,discoveries,backlog}.md,
     write ADRs 001–005:
       ADR-001 incremental migration (not rewrite) · ADR-002 TanStack Query v5 · ADR-003 nuqs URL state ·
       ADR-004 Zustand scope (cross-feature client only) · ADR-005 Tailwind v4 port-of-user-tokens
T0.2 Deps ONE-BY-ONE (.npmrc legacy-peer-deps masks conflicts; run npx tsc --noEmit after EACH):
     @tanstack/react-query nuqs vitest @testing-library/react @vitejs/plugin-react msw playwright @axe-core/playwright
     PIN @hello-pangea/dnd to current working version (risk R1). Remove junk deps opportunistically later (T10.2).
T0.3 Test infra: vitest.config.ts, playwright.config.ts, MSW node+browser setup, smoke test green.
     scripts/verify.sh = lint && tsc --noEmit && vitest run.
T0.4 entities/: Zod schemas mirroring backend contracts (cite source file per schema): user,
     task(+progress,+assignees), project(+member), work-session, daily-log, reward/purchase,
     responsibility, schedules, reports, issues, badges, notification. Round-trip vs prisma/seed.dev.ts fixtures.
T0.5 Typed fetch wrapper: per-endpoint functions, Zod-parsed, NO silent {data} unwrap.
     Capture REAL shape per endpoint from route source into api-contracts appendix
     (known inconsistencies: {tasks}|{data:[…]}|bare array — see context/system-discovery.md §API).
     Also resolve dead-call candidates: POST /api/badges/award and GET /api/users/search have NO route files.
T0.6 QueryProvider + lib/query/keys.ts factory (full pattern in spec/state-management.md).
T0.7 Tailwind v4 token port [after Phase −1 reconciliation]: @theme tokens first, class-compat shim second;
     Playwright screenshot baseline captured BEFORE switch; migrate component family-by-family.
T0.8 Checkpoint commit CP-0: infra green, ZERO behavior change, old app fully functional.
```

---

## TARGET ARCHITECTURE (summary — full detail in spec/architecture.md)

```
app/
  (auth)/login, register          # route group, no dashboard chrome
  (dashboard)/layout.tsx          # SERVER layout: session guard + providers
    dashboard/ projetos/ loja/ laboratorio/ weekly-reports/ admin/ leaderboard/ profile/
features/<domain>/{api,hooks,components,schemas,utils,__tests__}   # NO cross-feature imports
entities/                        # Zod schemas mirroring backend contracts (single type source)
shared/{ui,hooks,lib,providers}  # primitives promoted only from ≥2 consumer features
lib/                             # auth (keep), query-client, keys, config
```

Rules: server components default; `"use client"` islands where interaction demands; server-side route
guard in `(dashboard)/layout.tsx` via `getServerSession` (additive fix of client-only protection);
feature communication only via shared entities + query invalidation.

State split: TanStack Query (server) · Zustand single small ui-store (active session id, density, compact)
· nuqs (filters/tabs/ranges/pagination) · local useState (ephemeral) · next-auth + next-themes (as-is).

---

## TASK GRAPH

Deps in `[brackets]` · verification in `{braces}` · ⫇ = parallel lane. Full per-task gate checklists get written to `.spec/tasks/`.

### E1 SHELL & AUTH [CP-0]
```
T1.1 Route groups (auth)/(dashboard); move pages.
T1.2 Server layout guard via getServerSession (keep client redirects during transition).
T1.3 Error boundary + not-found + consolidate toast→sonner path-by-path (kill dual toast systems).
T1.4 Header/nav rebuild: permission items from ONE source (lib/auth/features.ts FEATURE_ACCESS);
     mobile menu; mount point for floating timer. {axe scan, keyboard nav}
```
**CP-1**: shell migrated; legacy contexts still mounted underneath.

### E2 TASKS/KANBAN (pattern-proving feature) [CP-1]
```
T2.1 Spec task-board.feature.md: lifecycle × visibility(public/delegated/private/global) × roles matrix;
     drag rules incl. non-leader "done"→review demotion (kanban-board.tsx:139–146); public-task auto-assign;
     points + late-penalty display; review-request notifications on entering in-review.
T2.2 MSW handlers FROM task gateway/routes (never invented shapes) incl. approve/reject/backlog/global-progress.
T2.3 Hooks: useTasks/useCreateTask/useUpdateTask/useCompleteTask/useApproveTask/useRejectTask;
     optimistic snapshot-rollback; invalidation map: tasks.list/detail + users.detail(userId) + leaderboard.
T2.4 Board UI rebuild [T2.3,T0.7]: nuqs filters (projectId, overdue, search), compact view, 7-day archive
     section parity, skeletons/empty/error/filtered-empty/conflict-toast states.
T2.5 Keyboard DnD alternative (per-card Move menu). {a11y parity with drag}
T2.6 Dialogs create/edit/detail/backlog: RHF+Zod everywhere; AlertDialog confirms (no window.confirm).
T2.7 Component+E2E tests: drag public vs delegated vs global; approval flow; demotion rule.
T2.8 Swap /dashboard route; delete task-context imports. {manual browser pass; import count 0}
```
**CP-2** commit.

### E3 WORK SESSIONS [CP-2]
```
T3.1 Spec session lifecycle: active↔paused↔completed; pause/resume race; reconnect; auto-pause@3600s dialog
     (floating-session-timer.tsx:14); log-on-end; elapsed derived from startTime math, not trusted local counter.
T3.2 Hooks + Zustand bridge (activeSessionId) + useQuery refetchInterval 30s (replace setInterval polling).
T3.3 Floating timer rebuild {unit tests: pause/resume/auto-pause math}; aria-live="polite" ticks.
T3.4 Daily-log UI (calendar integration lands in E5).
```

### E4 PROJECTS [CP-1] ⫇ E5,E6
```
T4.1 Spec+handlers (members/volunteers/hours/stats).
T4.2 List+detail with nuqs tabs/filters.
T4.3 Members/volunteers management dialogs.
T4.4 Manager dashboard tab; server stats via GET /api/projects/stats (kill client-side computation).
```

### E5 LABORATORY [CP-1] ⫇
```
T5.1 Split monolith spec → schedule / responsibility / issues sub-specs.
T5.2 Responsibility assume/end/notes/history + extract ROLE_PRIORITY moderation logic
     (currently inline laboratorio/page.tsx:32–40) + unit tests.
T5.3 Schedule grid + day-view calendar + events/notices forms → RHF+Zod; remove window.confirm (:274,:297);
     dedupe double-rendered <LaboratorySchedule/> (:366 and :555).
T5.4 Issues board (open→in_progress→resolved/closed + reopen mapping).
```

### E6 STORE [CP-1] ⫇
```
T6.1 Spec purchase lifecycle + balance display + approvals queue.
T6.2 Browse/redeem incl. insufficient-points disabled state + confirm dialog.
T6.3 Approvals table (pending count via query) + manage CRUD.
     Invalidation: purchases → users.points + rewards.
     FIX role drift: reward-context.tsx:68 checks only LABORATORISTA||COORDENADOR but
     FEATURE_ACCESS.MANAGE_REWARDS includes GERENTE — unify on features.ts.
```

### E7 REPORTS [E4] ⫇ E8
```
T7.1 Spec weekly(user/project) generation + saved reports + attachments + CSV/print.
T7.2 Weekly page rebuild — kill N+1 per-project fetch loop (weekly-reports/page.tsx:105–133);
     stop fabricating report objects client-side.
T7.3 Project reports panel + print route + CSV export.
```

### E8 ADMIN [CP-1] ⫇
```
T8.1 Spec + split ModernAdminPanel monolith.
T8.2 Users approve/reject/roles/status/points/hours-deduct flows.
T8.3 Badges manager + schedule grid + server-derived stats — FIX all-sessions fetch (admin/page.tsx:29);
     remove hardcoded activeResponsibilities=0 (:90).
```

### E9 PROFILE / LEADERBOARD [CP-1]
```
T9.1 Profile edit (avatar upload w/ progress, visibility setting).
T9.2 Leaderboard + badges display + progression view.
```

### E10 CLEANUP & FINAL AUDIT [all feature CPs]
```
T10.1 Delete dead code: ALL 13 contexts/*, contexts/api-client.ts, duplicate use-toast(×2)/use-mobile(×2),
      modern-button, empty NotificationProvider passthrough, hooks/ re-export shims, unreferenced shadcn
      comps — proven by knip-style zero-import scan.
T10.2 Dependency prune (unused radix/embla/immer/fs/path/etc., verified).
T10.3 Final audits per methodology §27 (arch/UX/design/engineering/legacy).
T10.4 Final report (methodology §28 template) + close-out state.
```

---

## CHECKPOINTS & PARALLELISM

- Checkpoint = `git commit` + update `.spec/state/current.md` + verify.sh green + manual browser pass on affected flows.
- Sequence: CP-0 → CP-1 → E2 (CP-2) → E3 → then **E4 ∥ E5 ∥ E6** → then **E7 ∥ E8** (E9 anytime post-CP-1) → E10.
- Specs (T\*.1) may be written ahead of their lane.
- Hard rule (methodology §17): a feature swap task INCLUDES deleting that domain's legacy imports. Import-count-zero gates every CP.

---

## VERIFICATION COMMANDS & QUALITY GATES

```bash
npm run lint && npx tsc --noEmit && vitest run && targeted playwright specs
```

- NEVER trust `next build` (eslint.ignoreDuringBuilds + typescript.ignoreBuildErrors are true).
- Per-feature browser validation: dev server + Playwright flow navigation, console/network check,
  screenshots light+dark × 320/768/1024/1440, axe-core scan, visual critique loop (methodology §18–19).
- Quality gates = methodology §20 checklist verbatim, encoded per-task in `.spec/tasks/`.
- MSW handlers derive from backend route/gateway source; contract test asserts handler responses against
  `entities/` schemas so mocks cannot drift into fiction.

---

## RISKS

| # | Risk | Mitigation |
|---|---|---|
| R1 | `@hello-pangea/dnd` pinned "latest" — React 19 drift | Pin working version (T0.2); E2E drag tripwire |
| R2 | Tailwind v4 port breaks visuals | Screenshot baseline BEFORE switch; family-by-family; adopt user's tokens |
| R3 | legacy-peer-deps hides broken installs | One-by-one installs + `tsc --noEmit` after each |
| R4 | Response-shape inconsistency (`{tasks}`/`{data}`/bare) breaks typed layer | T0.5 forbids silent unwrap; per-endpoint truth captured; MSW contract tests |
| R5 | Dual permission maps diverge further | Contract test asserting FEATURE_ACCESS semantics ⊇ rbac.PERMISSIONS; known drift bugs fixed in T6.3 |
| R6 | RSC + next-auth v4 + query hydration pitfalls | Start client-only queries; prefetch only where measured need |
| R7 | Two architectures forever | Import-count-zero enforced at every CP |
| R8 | Gamification neutralized migrations trap | NO prisma schema changes; out of scope (AGENTS.md warning) |
| R9 | pt-BR copy regressions | Copy frozen in specs; assertions include key strings |
| R10 | Scope creep (i18n, email notif, websockets, dark-mode-spec revival) | Backlog only |

---

## OPEN QUESTIONS — DEFAULTS APPLY UNLESS OVERRIDDEN IN state/current.md

| Q | Default |
|---|---|
| Q1 Dashboard default scope | ALL visible tasks + prominent "assigned to me" filter (current behavior) |
| Q2 Route slugs | Keep pt-BR (`/loja`, `/projetos`) — bookmark safety |
| Q3 Mobile kanban | Horizontal scroll < lg (current); accordion = backlog |
| Q4 Notifications cadence | refetchInterval 60s + refetchOnWindowFocus; no websockets this phase |
| Q5 i18n beyond pt-BR | Out of scope |

---

## STATE SCHEMA (`.spec/state/current.md` — update EVERY checkpoint)

```
phase · epic/task in progress · last completed · tests status · known failures ·
new discoveries · spec changes · next autonomous action · blocked[] {reason, evidence, attempted, required, safe-next}
Sidecar files: completed.md (append-only) · discoveries.md · backlog.md · blocked.md
```

---

## RECOVERY PROTOCOL (start of EVERY session)

1. Inspect `.spec/state/current.md`.
2. `git status --short`; inspect recent commits/diff.
3. Inspect incomplete tasks + known failures + current spec.
4. **Verify recorded state matches reality** — never assume a prior agent finished what state claims.
5. Repair inconsistencies; record discovery if reality diverged.
6. Resume from last safe checkpoint.

---

## COMPLETION CRITERIA (methodology §28)

New architecture documented · contracts documented · major UX flows specified · design system documented ·
implementation matches specs · meaningful tests green · browser validation passed · accessibility reviewed ·
visual quality reviewed · legacy removed or ADR-justified · no critical failures · persistent state accurate.
Final report sections: Architecture · Major Changes · API Integration · UX Changes · Design System ·
Testing · Migration Status · Removed Legacy · Known Limitations · Future Opportunities.
