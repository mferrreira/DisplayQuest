> **v2 STATUS (2026-08-24 evening):** Phase −1 + Phase 0 COMPLETE (CP-0 verified in-tree). This audit remains the as-is evidence base; target state governed by EXECUTION-PLAN.md. Anchors re-verified during v2 planning.

# DisplayQuest System Discovery Snapshot

**Captured**: 2026-08-24 · **Branch**: `dev` (dirty tree — user's dark-mode/token refactoring in flight, ~62 files)
**Purpose**: evidence-backed autopsy so an executing agent does NOT need to re-read the whole codebase.
Line numbers refer to the pre-refactor working tree; re-verify anchors during Phase −1 (EXECUTION-PLAN.md).

---

## 1. Stack & Environment

- Next.js 15 App Router, React 19, TypeScript 5, Prisma 6.11 (PostgreSQL), shadcn/ui + Radix, next-auth **v4**, Zustand (installed, **unused**), @hello-pangea/dnd ("latest"), react-hook-form + zod, sonner AND radix-toast (both present), tailwindcss 3.4 + tailwindcss-animate, date-fns.
- package.json name: `my-v0-project` (v0.dev origin). No test tooling installed.
- `.npmrc`: `legacy-peer-deps=true`. `next.config.mjs`: eslint+TS errors IGNORED at build; output standalone; images unoptimized.
- DB: docker-compose postgres `display-quest/display-quest123` :5432. Generated Prisma client at `lib/generated/prisma` (gitignored).
- middleware.ts handles ONLY `/uploads/avatars/*` (WebP headers). No auth middleware.
- Cron service initialized in root layout server-side (`initCronService()`).

## 2. Critical Rules (from AGENTS.md)

- Every API route MUST resolve modules via `getBackendComposition()` singleton — never `createXModule()` directly.
- Build lies: always verify with `npm run lint && npx tsc --noEmit`.
- Gamification migrations `202602161822_*` and `202602162235_*` were NEUTRALIZED to commented no-ops — never resurrect; gamification uses only `users`/`history` tables today.
- Seed is manual only (`tsx prisma/seed.ts` → re-exports seed.dev).
- User status must be `"active"` to pass `requireActiveUser()`.

## 3. Backend Architecture

### Composition root (`backend/composition/root.ts`)
Singleton at :88–94. Wiring: identityAccess → userManagement; notifications + gamification-events → taskManagement; identityAccess → projectManagement; identityAccess + notifications → labOperations; gamification ← workExecution events publisher. Modules: identity-access, notifications, gamification, user-management, task-management, project-management, project-membership, lab-operations, store, reporting, work-execution.

### Module layout convention
`modules/<domain>/{application/{contracts.ts,ports/,use-cases/}, infrastructure/, index.ts}` — gateways implement ports; repositories in `backend/repositories/*` wrap Prisma.

### Auth guard (`lib/auth/api-guard.ts`)
- `requireApiActor()` :17–38 → actor `{id, email, name, roles, status}` or error Response.
- `ensurePermission(actor, perm)` / `ensureAnyRole` / `ensureSelfOrPermission`.
- NOTE :15 creates its OWN identityAccess instance (stateless, harmless deviation from composition root).

### RBAC — TWO parallel maps (drift risk R5)
- Backend: `lib/auth/rbac.ts` PERMISSIONS (MANAGE_USERS, MANAGE_TASKS, MANAGE_PROJECTS, …) over roles COORDENADOR, GERENTE, LABORATORISTA, PESQUISADOR, GERENTE_PROJETO, COLABORADOR, VOLUNTARIO.
- Frontend: `lib/auth/features.ts` FEATURE_ACCESS (24 feature keys) — superset semantics; consumed via `hasAccess()` (re-exported through lib/utils/access-control.ts AND lib/utils/utils.ts bottom re-export).

## 4. Domain Model (details in spec/product-model.md)

Key tables & traps from `prisma/schema.prisma`:
- `users`: multi-role `UserRole[]`, status default `"pending"`, weekHours + currentWeekHours, profileVisibility enum.
- `tasks`: status/priority are plain Strings; `taskVisibility` default `"delegated"`; `isGlobal`; legacy `assignedTo` + modern `task_assignees` (unique taskId+userId).
- `task_user_progress`: per-user public-task progress (status default "to-do", pickedAt/completedAt/awardedPoints, unique taskId+userId).
- `work_sessions`: status default "active"; `work_session_tasks` join; optional 1:1 dailyLog.
- **Date fields stored as String**: projects.createdAt, tasks.dueDate, purchases.purchaseDate, lab_responsibilities.startTime/endTime → frontend MUST parse defensively.
- `project_reports` unique (projectId, periodType, periodStart, authorId) + attachments table.
- `notifications.data` is Stringified JSON.

### State machines (drive UI states)
- Task: to-do → in-progress → in-review → done | adjust(→in-progress). Public/global skip review (direct done + points). Delegated: done requires approval; points awarded ON APPROVAL.
- WorkSession: active ↔ paused (duration accumulates) → completed (+optional daily log auto-created).
- Purchase: pending → approved (points deducted) / rejected (restored) → used.
- User: pending → active | rejected; active ⇄ suspended.

### Task gateway business rules (`task-service.gateway.ts`) — frontend must mirror DISPLAY logic only
- Late penalty = daysLate × task.points (:593–607).
- Public progress-only updates allowed for assignee-self (:761–765 predicate; block moving others' unless manager :157).
- Delegated status-only updates restricted to assignees (:191–223); entering in-review notifies project leader (:209–219).
- Project leader cannot complete own task (:382–388). Approve/reject require MANAGE_USERS or project-leader-of-that-project (:441–456, :501–516).
- Reject appends `FIX (dd/mm/yyyy): reason` to description (:584–591).
- Global task creation requires MANAGE_USERS; forces visibility public, strips assignees/project (:87–93).

## 5. API Surface & Shape Inconsistencies (R4)

`contexts/api-client.ts` `fetchAPI` (:4–50): sets JSON header unless FormData; unwraps `data?.data || data` (:49) — SILENT normalization that hides real shapes; console.logs every call.

Real response shapes vary by endpoint:
- `{ tasks }`, `{ task }`, `{ users }`, `{ user }`, `{ projects }`, `{ rewards }`, `{ rewards? }` etc. — named-key style
- work-sessions returns `{ data }` wrapper (frontend defensively does `Array.isArray(response) ? response : result.data` — work-sessions-context.tsx:49)
- daily_logs `{ logs }`, lab-events `{ events }`, notifications raw `data.notifications`

**Dead-call candidates (route files NOT found for)**: `POST /api/badges/award` (BadgesAPI.award :593) and `GET /api/users/search?q=` (UserProfilesAPI.searchUsers :621). Verify in Phase −1; likely remove or backend-add.
Also `WorkSessionsAPI.getWeeklyHours` is an EMPTY stub (:473–475).
Task approve/reject bypass TasksAPI via raw fetch in task-context (:166–171, :201–207).
GET /api/tasks accepts userId+roles params but IGNORES them server-side except projectId path (route.ts:13–43 — filtering is session-actor based).

Full inventory: spec/api-contracts.md.

## 6. Frontend Inventory

### Routes (app/)
`/` landing · `/login` · `/register` · `/dashboard` (kanban) · `/dashboard/projetos` · `/dashboard/loja` (+`/gerenciar`) · `/dashboard/laboratorio` (+layout) · `/dashboard/weekly-reports` (+layout) · `/dashboard/admin` · `/dashboard/leaderboard` · `/dashboard/profile` · `/dashboard/project-reports/[id]/print` · ~47 API routes.

### Provider stack (`app/client-layout.tsx`)
SessionProvider(refetchOnWindowFocus=false) → ThemeProvider(class, default light) → LayoutContent → [dashboard only] UserProvider → ProjectProvider → WorkSessionsProvider → (pathname-gated :16–25) TaskProvider → AppHeader + FloatingSessionTimer.
⚠ Conditional provider mounting = hooks throw outside gated paths.

### The 13 contexts (all follow useState+useEffect-fetch pattern, no cache layer)
auth (thin next-auth wrapper; Provider EMPTY passthrough :16–18) · user (fetchUsers/update/addPoints; hardcoded role list :35–47 duplicating features.ts) · project · task (coupling bug: completeTask calls fetchUsers() :148; approve/reject raw fetch) · reward (**role drift :68**: store-manage check omits GERENTE vs FEATURE_ACCESS) · work-sessions (pause sends client-computed duration; resume resets startTime :185–188 — fragile semantics) · responsibility · laboratory-schedule · lab-events · lab-notices · issue · weekly-report · notification (**Provider is empty passthrough :29–31; hook uses raw fetch, bypasses api-client**) + use-toast + use-mobile.
Duplicate copies exist under components/ui/: `use-toast.ts`, `use-mobile.tsx`.

### Hooks
hooks/use-work-sessions.ts = pure re-export shim; use-daily-logs.ts; use-project-members.ts.

### Components
ui/ 60+ (shadcn + custom kanban-*, timer, stats variants, modern-button DUPLICATE of button, data-table, form-field…) · features/ 18 (kanban-board 367ln, task-dialog, project-* ×9, issue-management, volunteers-management, laboratory-schedule, lab-responsibility-status…) · forms/ 8 (mixed RHF+Zod vs raw useState) · admin/ 7 (ModernAdminPanel monolith, ScheduleGrid, badge-manager, create-user-dialog…) · layout/ 4.

## 7. Code-Smell Ledger (file:line evidence)

| Smell | Evidence |
|---|---|
| Cross-context coupling | task-context.tsx:148 `await fetchUsers()` inside completeTask |
| Pathname-gated provider | client-layout.tsx:16–25 |
| Non-leader drag demotion | kanban-board.tsx:139–146 toast-block + :164 done→in-review remap |
| Optimistic shadow state ad-hoc | kanban-board.tsx:39,71–73 optimisticTasks mirror |
| Timer polling + magic constant | floating-session-timer.tsx:55–57 (30s), :14 AUTO_PAUSE=3600s, autoPausedSessionIdsRef dedupe :49 |
| Admin fetches ALL sessions unfiltered | admin/page.tsx:29; stats client-side :81–95; activeResponsibilities hardcoded 0 :90 |
| N+1 report fetch loop | weekly-reports/page.tsx:105–133 Promise.all per project; client-fabricated report objects :42–97 |
| Empty notification provider | notification-context.tsx:29–31 |
| window.confirm destructive UX | laboratorio/page.tsx:274,:297; task-dialog.tsx:83 |
| Same component rendered twice | laboratorio/page.tsx `<LaboratorySchedule/>` :366–368 AND :555–557 |
| Role-priority map inline | laboratorio/page.tsx:32–40 ROLE_PRIORITY |
| Reward manage-role drift | reward-context.tsx:68 omits GERENTE |
| Duplicated user-viewable-role list | user-context.tsx:35–47 |
| Mixed toast systems | loja/page.tsx imports radix toast + Toaster while sonner also configured |
| Unwrapped-any API client | api-client.ts throughout (`any[]`, silent unwrap) |
| Junk deps | immer, fs, path pinned "latest"; unused zustand/embla/cmdk/input-otp etc. |

## 8. Styling Baseline

- Tailwind v3 config: HSL CSS vars (--background…--ring, chart×5, sidebar×7, success/warning/info ADDED by user's in-flight refactor, radius 0.75rem), darkMode class, tailwindcss-animate plugin.
- User's in-flight globals.css diff: light adds success/warning/info vars; dark rebuilt to blue-tinted neutrals (hue≈222 elevation scale background<card<popover), primary blue `217 91% 50%` (was green), ring→blue.
- Separate `dark-mode-spec/` repo folder exists (prior effort: 00-STATE,01-audit,02-design-tokens,03-tasks,04-testing,baseline/,phases/,reference/,tools/) — contents unread; fold-or-archive decision in Phase −1.

## 9. In-Flight Refactoring Observation (2026-08-24)

~62 modified files on `dev`: admin/features/forms/ui components, layouts pages, globals.css, tailwind.config.ts, **prisma migration.sql + seed.dev.{ts,js}**, AGENTS.md. Pattern suggests styling/token + dark-mode polish pass. EXECUTION starts ONLY after this merges clean; Phase −1 re-baselines everything above against the merged result.

**Post-planning feature added (still legacy stack, 2026-08-24)**: multi-period per-project report
generation now works from `/dashboard/weekly-reports` → "Relatórios de Projeto" tab. Changes:
`project-report-dialog.tsx` gained optional `projects` prop + required project Select when `projectId===0`
(submit disabled until chosen); `project-reports-panel.tsx` threads it through; weekly-reports page passes
`useProject().projects`. Backend unchanged (already supported periodType+reference+assertCanCreateOnProject).
E7 (Reports) must migrate THIS flow too; dialog is still useState-based, not RHF+Zod.

## 10. Not Verified During Planning (honesty ledger)

- Context internals unread (only types/interfaces seen): responsibility-, laboratory-schedule-, lab-events-, lab-notices-, issue-, weekly-report-contexts.
- Components unread: project-list, project-detail-dialog, issue-management, volunteers-management, ModernAdminPanel internals, ScheduleGrid, DayViewCalendar, LaboratorySchedule, most forms, mobile-menu, theme-provider.
- Routes unread: projects/[id]/* subroutes, users/[id]/* subroutes, reporting/store/work-execution/lab-operations gateways, notifications module internals, server-auth.ts internals, cron service.
- dark-mode-spec/ folder contents unread beyond directory listing.
- Dead-call candidates (badges/award, users/search) not confirmed absent at runtime — verify in Phase −1.

## 11. Migration Audit — ALREADY DONE 2026-08-24 (skip re-doing in Phase −1; re-confirm only if new migrations land)

User pushed commit `3245651 chore: added migrations and AGENTS.md` (neutralized the two gamification
migrations + touched add_project_reports). Verified against live DB (`display-quest-db`, docker, healthy):

- `prisma migrate status` → "Database schema is up to date!" ✅
- Full history replay vs schema.prisma (shadow DB diff) → **EMPTY** ✅ — neutralization solved the
  permanent-drift problem from AGENTS.md; no more DROP proposals.
- Residue A: `_prisma_migrations` contains phantom row `20260820163441_fasd` (applied=true) whose folder
  no longer exists. Harmless; fresh environments replay from folders only. Cosmetic.
- Residue B: live DB has orphan columns on `tasks`: `order`, `parentId` (+ FK tasks_parentId_fkey +
  index tasks_parentId_idx) NOT present in schema.prisma. Codebase has ZERO references (verified by grep;
  only Prisma `orderBy`, unrelated). Runtime ignores them, and clean replay means no future migration
  will touch them. Optional cleanup migration pending user decision (as of 2026-08-24).
- Phase −1 item 5 is therefore SATISFIED unless new migrations appear before execution starts.
