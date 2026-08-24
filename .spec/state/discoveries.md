# Discoveries (append-only)

## D-1 · 2026-08-24 · floating-session-timer moved
Discovery said `components/features/floating-session-timer.tsx`. Actual: **`components/ui/floating-session-timer.tsx`**
(moved by user's token refactor). Anchors intact there: AUTO_PAUSE `60*60` :14, 30s poll :55–57.
→ architecture.md/smell ledger references updated mentally; use ui/ path in E3 tasks.

## D-2 · 2026-08-24 · dark-mode-spec/ folder deleted
Phase −1 item 4 (fold decisions from `dark-mode-spec/`) is a NO-OP: folder no longer exists in repo.
Nothing to fold; its outcome already lives in landed globals.css tokens. Backlog note added; item closed.

## D-3 · 2026-08-24 · dead-call candidates CONFIRMED
`app/api/badges/award` and `app/api/users/search` do NOT exist (folder listing verified).
BadgesAPI.award (:593) and UserProfilesAPI.searchUsers (:621) are dead calls → remove call sites in
respective feature migrations (T0.5 records; E8/E9 execute).

## D-4 · 2026-08-24 · ESLint is not installed at all
No `eslint`, no `eslint-config-next`, no config file. `npm run lint` hangs on Next's interactive
setup prompt. Discovery contradicts AGENTS.md verification checklist assumption. Fix in T0.2/T0.3:
install pinned eslint tooling + `.eslintrc.json` (`next/core-web-vitals`) so verify.sh never blocks.

## D-5 · 2026-08-24 · task-context has SECOND fetchUsers coupling
Beyond known `completeTask` coupling (:148), `approveTask` also calls `await fetchUsers()` (:183).
Both die together when tasks migrate to TanStack Query invalidation (T2.3).

## D-6 · 2026-08-24 · anchors re-verified post-token-refactor
All smell-ledger anchors hold with ≤2-line shifts: kanban demotion kanban-board.tsx:139–140/:163–164;
admin all-sessions fetch admin/page.tsx:29 + hardcoded 0 :90; laboratorio ROLE_PRIORITY :32,
window.confirm :274/:296, double `<LaboratorySchedule/>` :367/:556; reward role drift reward-context.tsx:68;
client-layout pathname gating (DashboardProviders); weekly N+1 Promise.all loop weekly-reports/page.tsx:~105–133
(still client-fabricates report objects via buildProjectDetailReport after user's d875233).
13 contexts + api-client.ts + hooks shims all present. No new Prisma migrations since §11 audit;
`prisma migrate status`: up to date (DB healthy).

## D-7 · 2026-08-24 · user committed during planning handoff
User committed their project-report picker work themselves as `d875233 feat: Temporal reports form added`
while execution was starting. Tree clean afterwards. weekly-reports/page.tsx passes mapped `{id,name}`
projects into ProjectReportsPanel — noted for E7 spec so we don't regress the picker.
