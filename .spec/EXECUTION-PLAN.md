# DisplayQuest Frontend Refactor — Master Execution Plan v2.0

**Version**: 2.0 · **Created**: 2026-08-24 · **Status**: EXECUTING (CP-0 reached 2026-08-24; CP-0.5 = state reconstruction)

**Process methodology**: `PLAN.md` governs *how* to operate. This file is the project-specific *what/when/in-what-order*.
**Knowledge base**: `constitution.md`, `product-model.md`, `architecture.md`, `api-contracts.md` (+ REAL WIRE SHAPES appendix), `ux-model.md`, `design-system.md`, `state-management.md`, `context/system-discovery.md`.
**Fresh-session entrypoint**: read `.spec/state/current.md` → Recovery Protocol (PLAN.md §23) → resume.

---

## SITUATION LEDGER (v2 re-planning, 2026-08-24 evening)

A prior session produced the knowledge base and executed Phase −1 + Phase 0 to **CP-0** (verified in-tree:
deps, vitest/playwright/msw infra, verify.sh, entities/ round-trip-tested, lib/api typed client +
endpoints, queryKeys factory + QueryProvider, Tailwind v4 port 64/64 pixel-identical). Its E1 WIP was
stashed; the user then wiped `.spec/` except the methodology and requested full re-planning.

**User decisions recorded for v2:**
1. `stash@{0}` ("E1 WIP: route groups + server guard") is DROPPED, not popped — E1 rebuilds fresh (ADR-007).
2. Standing directives carried forward: execute directly on `dev`; autonomous commit at every checkpoint
   once verify.sh gates pass; NEVER push without explicit request; ask before touching user WIP.

Everything below was verified against the live tree during v2 planning; anchors from system-discovery
re-checked 2026-08-24 evening.

---

## STRATEGY

**Incremental route-by-route migration (ADR-001).** Backend = stable domain authority. Hard rule against
two architectures forever: every swap task INCLUDES deleting that domain's legacy imports;
import-count-zero per domain gates every checkpoint.

## TARGET ARCHITECTURE

```
app/
  (auth)/login, register           # route group, no dashboard chrome
  (dashboard)/layout.tsx           # SERVER layout: getServerSession guard + chrome
    dashboard/ projetos/ loja/ laboratorio/ weekly-reports/ admin/ leaderboard/ profile/
features/<domain>/                 # api/ hooks/ components/ schemas/ utils/ __tests__/
                                   # cross-feature access ONLY via feature's public index.ts API
entities/                          # EXISTS — Zod mirror of backend contracts (single type source)
shared/{ui,hooks,providers,stores} # promoted only from ≥2 consumer features
lib/{api,query,auth}               # client.ts + endpoints/* + keys.ts EXIST
```

State split (ADRs 002–004): TanStack Query v5 = all server state · nuqs = filters/tabs/ranges/pagination ·
one tiny Zustand ui-store (activeSessionId, density) · local useState = ephemeral · next-auth/next-themes as-is.
Server components by default; `"use client"` islands where interaction demands.

## RESOLVED DEFAULTS (apply autonomously unless overridden in state/current.md)

| Q | Default |
|---|---|
| Dashboard default scope | ALL visible tasks + prominent "assigned to me" filter |
| Route slugs | KEEP pt-BR (`/loja`, `/projetos`) — bookmark safety |
| Mobile kanban | Horizontal scroll <lg; accordion = backlog |
| Notifications | refetchInterval 60s + refetchOnWindowFocus; no websockets |
| i18n beyond pt-BR | OUT_OF_SCOPE |
| Fonts | Self-hosted via @fontsource (offline-safe Docker builds) — ADR-006 |
| Destructive actions | AlertDialog confirms everywhere; window.confirm banned |
| Prisma schema | NO changes this phase (R8 gamification-migration trap) |

## TASK GRAPH

Every epic follows: **spec → MSW handlers (from real route/gateway source) → hooks+invalidations → UI → tests → swap route → delete legacy imports → gates → commit + state update.**

```
E0 STATE RECONSTRUCTION [CP-0]       Restore .spec KB from git history + patch v2 findings; drop stash;
                                     EXECUTION-PLAN.md, ADR-006/007, legacy-map.md, state rewrite.
                                     Gates → commit CP-0.5.
E1 SHELL & AUTH [CP-0.5]
  T1.1 Convert .eslintrc overrides to BASENAME matching BEFORE any file move (D-9 fix);
       route groups (auth)/(dashboard); move pages; URLs unchanged.
  T1.2 Server layout guard getServerSession in (dashboard)/layout.tsx (additive; keep client
       redirects during transition).
  T1.3 Global error.tsx/not-found.tsx boundaries; consolidate dual toast systems → sonner only.
  T1.4 Header/nav rebuilt from ONE permission source (lib/auth/features.ts FEATURE_ACCESS);
       mobile menu; floating-timer mount point.
     T1.4b Notification bell + features/notifications hooks (unread count, mark-read, mark-all).
  T1.5 Login/register pages RHF+Zod parity incl. error/loading states.
  T1.6 Fonts per ADR-006 (@fontsource-variable/inter + mono for timers/ids).
  T1.7 Contract test: FEATURE_ACCESS semantics ⊇ backend rbac.PERMISSIONS (kills drift R5).
  → CP-1: shell migrated; legacy contexts still mounted underneath; recapture visual baseline
    (route structure changed); axe scan + keyboard nav pass on shell.
E2 TASKS/KANBAN [CP-1] (pattern-proving feature)
  T2.1 Spec task-board.feature.md: lifecycle × visibility(public/delegated/private/global) × roles;
       non-leader done→review demotion rule; public auto-assign; points + late-penalty display;
       review-request notifications on entering in-review.
  T2.2 MSW handlers FROM gateway/routes incl. approve/reject/backlog/global-progress.
  T2.3 Hooks useTasks/useCreateTask/useUpdateTask/useCompleteTask/useApproveTask/useRejectTask;
       optimistic snapshot-rollback; invalidate tasks.* + users.detail(userId) + leaderboard.
  T2.4 Board UI [T2.3,T0.7]: nuqs filters (projectId, overdue, search), compact view, 7-day archive,
       FULL STATE GRID (loading/error/empty/filtered-empty/conflict/unauthorized/permission-denied).
  T2.5 Keyboard DnD alternative (per-card Move menu) {a11y parity}.
  T2.6 Dialogs create/edit/detail/backlog: RHF+Zod; AlertDialogs (no window.confirm).
  T2.7 Component+E2E tests: drag public vs delegated vs global; approval flow; demotion rule.
  T2.8 Swap /dashboard; delete task-context imports (incl. fetchUsers couplings :148,:183);
       repoint type imports to entities/. {import-count-zero}
  → CP-2
E3 WORK SESSIONS [CP-2]
  T3.1 Spec lifecycle active↔paused↔completed; pause/resume race; reconnect; auto-pause@3600s dialog;
       log-on-end; elapsed derived from startTime math (never trust local counters).
  T3.2 Hooks + Zustand bridge (activeSessionId) + useQuery refetchInterval 30s (replace setInterval).
  T3.3 Floating timer rebuild {unit-tested pause/resume/auto-pause math; aria-live="polite"}.
  T3.4 Daily-log UI (calendar integration lands in E5; consume via public feature API).
  → CP-3
E4 PROJECTS [CP-1] ⫇ E5,E6           List/detail nuqs tabs/filters; members/volunteers dialogs; manager
                                     dashboard tab via GET /api/projects/stats (kill client-side stats);
                                     consolidate lib/api/project-members.ts into endpoints/.
E5 LABORATORY [CP-1] ⫇               Split 738-line monolith → schedule/responsibility/issues sub-specs;
                                     extract ROLE_PRIORITY to tested util; remove window.confirm (:274,:297);
                                     dedupe double <LaboratorySchedule/> (:367/:556); issues board states.
E6 STORE [CP-1] ⫇                    Purchase lifecycle spec (D-8 domain: pending/approved/rejected/
                                     completed/cancelled); insufficient-points disabled state + confirm;
                                     approvals queue; manage CRUD; FIX reward-context role drift :68 →
                                     unify on features.ts; kill defunct "used" status rendering;
                                     invalidate purchases → users.points + rewards.
E7 REPORTS [E4] ⫇ E8                 Kill N+1 per-project fetch loop + client-fabricated report objects
                                     (weekly-reports/page.tsx:105–133); PRESERVE temporal-reports picker
                                     flow (d875233); project reports panel + CSV export + print route.
E8 ADMIN [CP-1] ⫇                    Split ModernAdminPanel monolith; users approve/reject/roles/status/
                                     points/deduct-hours; badges manager (remove dead award call);
                                     server stats (kill all-sessions unfiltered fetch admin/page.tsx:29;
                                     remove hardcoded activeResponsibilities=0 :90).
E9 PROFILE/LEADERBOARD [CP-1] ⫇      Profile edit (avatar FormData upload w/ progress), visibility setting;
                                     leaderboard + badges display + progression view.
E10 CLEANUP & FINAL AUDIT [all CPs]  Delete ALL 13 contexts/*, contexts/api-client.ts, contexts/types.ts,
                                     duplicate use-toast(×2)/use-mobile(×2), modern-button, empty
                                     notification passthrough, hooks/ shims — proven zero-import;
                                     dependency prune (immer/fs/path/unused radix/embla/cmdk/input-otp…);
                                     methodology §27 audit; §28 final report.
```

Sequence: CP-0.5 → CP-1 → E2(CP-2) → E3(CP-3) → E4∥E5∥E6 → E7∥E8 (E9 anytime post-CP-1) → E10.
Specs may be written ahead of their lane. Checkpoint = verify.sh green + browser pass + commit on dev + state/current.md update.

## QUALITY GATES (verbatim checklist per task, encoded in .spec/tasks/)

```
[ ] Specification complete        [ ] Architecture consistent        [ ] API contract verified
[ ] Implementation complete       [ ] Unit/component tests passing   [ ] Integration tests passing
[ ] E2E behavior passing          [ ] Accessibility reviewed         [ ] Responsive reviewed (320/768/1024/1440)
[ ] Visual review completed       [ ] No known regression            [ ] Legacy removed or explicitly retained
[ ] Documentation/state updated
```

Per screen spec MUST define the full state grid: loading / error / empty / filtered-empty /
conflict-revert / unauthorized / permission-denied. Commands:

```bash
scripts/verify.sh   # next lint && tsc --noEmit && vitest run  — before EVERY checkpoint commit
# NEVER trust npm run build (TS/eslint ignored by config)
node scripts/capture-visual-baseline.mjs <name> 3000   # login coordenador@lab.com / 123
node scripts/compare-visual-baseline.mjs <a> <b> 0.01
```

MSW contract tests assert handler payloads against entities/ schemas so mocks cannot drift into fiction.

## RISKS

| # | Risk | Mitigation |
|---|---|---|
| R11 | vitest round-trip test needs live Postgres → verify.sh fails w/o docker | Recovery step 0: ensure `docker-compose up -d` (db: display-quest/display-quest123 :5432) |
| R12 | Dual type source contexts/types.ts ↔ entities/ until each swap | Swap tasks explicitly repoint imports; import-count-zero gate |
| R13 | Lint override paths break on file moves (D-9 recurrence) | Basename matching converted in T1.1 BEFORE moves |
| R1–R10 | dnd pin · visual regressions · peer deps · wire shapes · RBAC drift · hydration · dual arch forever · prisma trap · pt-BR copy · scope creep | Carried from v1 (see git history ADRs/specs); mitigations embedded in tasks |

## COMPLETION CRITERIA (methodology §28)

New architecture documented · contracts documented · UX flows specified · design system documented ·
implementation matches specs · meaningful tests green · browser validation passed · a11y reviewed ·
visual quality reviewed · legacy removed or ADR-justified · no critical failures · persistent state accurate.
Final report sections: Architecture · Major Changes · API Integration · UX Changes · Design System ·
Testing · Migration Status · Removed Legacy · Known Limitations · Future Opportunities.
