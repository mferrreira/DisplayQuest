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

## D-8 · 2026-08-24 · Purchase status domain diverges from product-model; legacy rows in DB
Round-trip test caught it live. Backend truth (store-service.gateway.ts): pending → approved |
rejected (both refund paths handled) → completed; cancel → cancelled. product-model.md said
"used" as terminal state — PATCHED. Frontend loja/page.tsx still renders "used" (:217) — latent
drift bug, fix lands with E6. Dev DB contains legacy rows `delivered` (id 1) and `processing`
(id 2) written by pre-module versions; entity schema intentionally REJECTS them (contract encoded
in round-trip test). Data cleanup = user decision, backlog item added.

## D-9 · 2026-08-24 · E1 WIP stashed; lint override paths break on file moves
First T1.1 attempt (route groups (auth)/(dashboard) + server guard in (dashboard)/layout.tsx +
DashboardChrome) was STASHED at user request: `git stash@{0}` ("E1 WIP: route groups + server
guard"). Root cause of the loop: `.eslintrc.json` overrides scoped the 5 legacy files by OLD paths;
after `git mv`, paths changed → scoped warnings stopped matching → same errors resurfaced in
verify.sh. WHEN RESUMING E1: pop the stash, update override paths to
`app/(dashboard)/dashboard/...` (or convert overrides to basename matching), then proceed with
T1.1 verification. Structural work itself was sound (tsc clean after .next/types refresh).

## D-10 · 2026-08-24 (v2 planning) · body font is Arial, contradicting design-system
`app/globals.css` sets `body { font-family: Arial }`; design-system.md declares Inter + JetBrains Mono.
Resolved by ADR-006: self-hosted @fontsource variable fonts in T1.6, landed BEFORE CP-1 baseline
recapture so the new baseline carries final typography.

## D-11 · 2026-08-24 (v2 planning) · vitest suite includes LIVE-DB round-trip test
tests/integration/entities-roundtrip.test.ts hits Postgres. verify.sh therefore requires docker db up.
Recovery step 0 = ensure docker-compose db healthy (R11). Do not "fix" by deleting the test — it is
the contract guard that caught D-8.

## D-12 · 2026-08-24 (v2 planning) · lib/api/project-members.ts sits outside endpoints/
Foundation created `lib/api/endpoints/{tasks,projects,users,notifications,work-sessions}.ts` plus a
stray `lib/api/project-members.ts`. Consolidate into endpoints/projects.ts during E4; no new code may
import the stray file.

## D-15 · 2026-08-25 (E1/CP-1) · dashboard a11y inventory — obligations for E2 spec
Axe scan of /dashboard (authenticated) found, all within LEGACY board markup that E2 rebuilds:
1. [critical button-name] 11 icon-only action buttons on kanban cards (incl. dropdown triggers).
2. [serious aria-progressbar-name] progressbars without accessible name (6 instances).
3. [serious color-contrast] "N tarefa(s) atrasada(s)" banner text fails contrast.
4. [serious nested-interactive] @hello-pangea/dnd draggable role=button contains buttons.
CP-1 axe gate scoped to SHELL (header + login page). T2.1 (task-board.feature.md) MUST encode
1–4 as acceptance criteria of the NEW board; T2.5 keyboard alternative must resolve 4 by design.

## D-13 · 2026-08-25 (E1) · NEXTAUTH_SECRET missing from dev environment
`.env` had ONLY DATABASE_URL. Dev-issued JWE cookies failed server-side verification
(JWT_SESSION_ERROR → every API 401 "Não autorizado"). Was masked historically because browsers
share cookies across ports on localhost and the docker prod build (:3000) HAS a secret.
FIX: NEXTAUTH_SECRET + NEXTAUTH_URL=:3001 appended to .env (gitignored) + .env.example created.
Any fresh clone MUST set these or login breaks.

## D-14 · 2026-08-25 (E1/T1.4b) · foundation notifications endpoint had WRONG contract
lib/api/endpoints/notifications.ts assumed PATCH {read:true}; the route only implements
PUT {action:"markAsRead"} ([id]/route.ts:14, PATCH absent → 400). Also ?count=true →
{success,count} and DELETE were undocumented. Endpoint file rewritten from route source.
Lesson: T0.5's "capture real shape" must include METHOD, not just envelope.

## D-16 · 2026-08-25 (CP-1) · register page used window.alert for success
Replaced with sonner toast during T1.5 (constitution A3). Legacy alert()/confirm() sweep
continues per-domain (laboratorio :274/:297 in E5, task-dialog :83 in E2).

## D-17 · 2026-08-25 (E2/T2.2) · entities/task priority enum missed 'urgent'
backend/models/Task.ts TaskPriority = low|medium|high|urgent; entity enum had only low|medium|high.
A single 'urgent' row would fail list parse (zod) and break the whole board. Fixed in entities;
round-trip test had not caught it (no urgent rows in dev DB).

## D-18 · 2026-08-25 (E2/T2.4) · LIVE DB contains legacy task statuses outside the enum
Rows 36–40: status in {completed, pending, in_progress} — written before the 5-value enum existed.
Backend passes them through unvalidated (plain String column); legacy board silently DROPPED them
(columns matched exact status); strict zod rejected the ENTIRE list (board error state).
Resolution: entities/task.ts gains wireTaskStatus (explicit documented map + console.warn);
endpoints parse with wireTaskSchema; taskSchema stays STRICT for contract tests. Cleanup UPDATE
migration proposed in backlog — PENDING USER DECISION. Post-fix: board renders all 9 rows incl.
the 5 previously-invisible ones. NOTE: initial post-swap e2e failures were THIS, not compile time.

## D-19 · 2026-08-25 (E2/E2E closeout) · backend single-create route missing status default
POST `/api/tasks` (single create) does NOT default `status` when omitted — Prisma throws arg
validation error (500). The backlog branch DOES default to "to-do" at :72. Frontend fix applied:
`task-dialog.tsx` now sends `status: "to-do"` on create. Backend route should harden with an
explicit default or validation to match the backlog branch behavior — backlog item for backend
hardening phase.
