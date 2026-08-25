# Feature Spec — Task Board (Kanban) · E2

**Status**: APPROVED_FOR_IMPLEMENTATION · **Created**: 2026-08-25 · **Epic**: E2 · **Route**: `/dashboard`
**Backend authority**: `backend/modules/task-management/` (gateway rules cited by line), `backend/models/Task.ts`, `app/api/tasks/**`
**Replaces**: `contexts/task-context.tsx`, `components/features/kanban-board.tsx`, `components/ui/kanban-*`, `task-dialog.tsx`, `task-detail-dialog.tsx`, `backlog-dialog.tsx` (fates in `migrations/legacy-map.md`)

---

## 1. Purpose
The task board is the product's core daily surface: lab members see the work available to them,
move tasks through the lifecycle, and earn points. This spec governs the NEW feature-based
implementation (`features/tasks/`) that replaces the legacy context-driven board.

## 2. Actors & Permissions (backend-derived)
| Capability | Who (source) |
|---|---|
| See ALL tasks | COORDENADOR, GERENTE, COLABORADOR (`listTasksForUser` gateway :38–47 hasAnyRole) |
| See own + membership-project tasks | everyone else (:49–64: assigned ∪ project-membership ∪ explicit assignees) |
| Create task / backlog | `MANAGE_TASKS` (route guard; FEATURE_ACCESS adds PESQUISADOR/COLABORADOR — backend route is authority, verify at T2.2) |
| Create GLOBAL quest | `MANAGE_USERS` (gateway :87); forces visibility=public, strips project+assignees (:90–93) |
| Edit/delete task fields | `MANAGE_TASKS` (route) ; completed tasks additionally COORDENADOR/LABORATORISTA/GERENTE_PROJETO/GERENTE or project creator/leader (gateway :225–241) |
| Status-only move of non-public task | assignee only (gateway :191–197) |
| Progress-move of PUBLIC task | self only; on behalf of others requires MANAGE_TASKS/MANAGE_USERS (:156–159); project members only for project tasks (:161–167) |
| Complete (direct done) | public/global → done immediately; delegated/private → **in-review** (:401) |
| Approve/Reject | `MANAGE_USERS` OR GERENTE_PROJETO who is **leader of that task's project** (:441–456, :501–516) |
| Leader completing own assigned task | **FORBIDDEN** (:382–388, error "Líderes de projeto não podem concluir suas próprias tasks") |

## 3. Domain Rules (display-side mirror — never re-decide, only present)
- **Lifecycle**: `to-do → in-progress → in-review → done`, with `adjust` re-entering `in-progress`.
  Public/global tasks skip review (direct done + points). Delegated done → in-review; points awarded
  **on approval** (approveTask :458–481).
- **Per-user progress on public tasks**: the API returns public tasks with the ACTOR's progress
  overlaid (`applyActorProgress` :617–651) — same board cell can differ per user. UI must NOT cache
  public-task status across users or treat it as global truth.
- **Late penalty**: `daysLate = ceil((completion − dueDate)/24h)`; `penalty = daysLate × points`;
  award = `points − penalty` (can go ≤0) (:593–607). UI displays potential penalty on overdue cards.
- **Rejection**: appends `FIX (dd/mm/yyyy): <reason>` to description (:584–591) — detail dialog
  renders fix instructions distinctly.
- **Auto-assign public task**: on first move past to-do, actor with COMPLETE_PUBLIC_TASKS is
  recorded as the mover (legacy :178–187; backend records progress userId).
- **Review request**: entering in-review notifies the project leader (server-side; UI surfaces the
  resulting notification via features/notifications).

## 4. Inputs / Outputs
- **List**: `GET /api/tasks` → `{ tasks: Task[] }` (actor-scoped; client params are filters only).
- **Create**: `POST /api/tasks` body CreateTaskCommand → `{ task }`; backlog `{ tasks: [...] }` → `{ tasks, createdCount }`.
- **Update fields**: `PUT /api/tasks/[id]` → `{ task }`.
- **Move/complete**: `PATCH /api/tasks/[id]` `{ action: "complete", userId? }` → `{ task }`.
- **Approve/Reject**: `POST /api/tasks/[id]/approve|reject` (`{ reason? }` for reject) → `{ task }`.
- **Delete**: `DELETE /api/tasks/[id]` → `{ success }`.
- **Global progress**: `GET /api/tasks/global-progress?userId=` → `{ progress: TaskUserProgress[] }`.

## 5. UI Behavior
### 5.1 Board
- 5 columns (A Fazer, Em Andamento, Em Revisão, Ajustes, Concluído) in lifecycle order; horizontal
  scroll < lg (Q3); column headers show live counts.
- Cards: title, description snippet, badges — priority (BAIXA/MÉDIA/ALTA/URGENTE), status, visibility
  (PÚBLICA/GLOBAL + 🌍), points, progress bar (public tasks, actor progress), due date + ATRASADA flag,
  assignee names (from users cache), project name when present.
- **Archive**: done+completed tasks with `completedAt||dueDate` older than 7 days leave the board and
  appear under a collapsible "Concluídas há mais de 7 dias" section (legacy parity :95–109).
- **Filters (nuqs)**: `projeto=<id>`, `atrasadas=1`, `busca=<term>`, `visao=compacta` — shareable,
  back/forward-safe. Project selector visible only to MANAGE_PROJECTS (legacy parity :120).
- **Drag & drop** (@hello-pangea/dnd): moving columns issues the correct call per §3
  (complete vs update). Rules preserved from legacy:
  - Non-leader dragging OUT of done → blocked with destructive toast "Apenas líderes de projeto
    podem mover tarefas concluídas." (:139–146)
  - Non-leader dragging TO done → silently remapped to in-review + review toast (:164, :201–204).
  - Direct-done toast "🎉 Tarefa Concluída! N pontos…"; delegated "📋 Tarefa Enviada para Revisão…" (:196–208).
- **Keyboard alternative (T2.5, D-15.4)**: every card has a "Mover" dropdown menu (or menu button)
  listing allowed target columns; same rules/toasts as drag. Cards remain focusable; drag handles
  get `aria-label`; the draggable wrapper MUST NOT contain the action buttons (nested-interactive fix —
  actions live outside the DnD handle subtree).

### 5.2 Dialogs (all RHF+Zod)
- **Create/Edit** (`task-dialog`): title (1–200, required), description (≤1000), project select,
  assignees multi-select (members of chosen project; hidden for global), due date (date input),
  points (≥0 int), priority select, visibility select (public/delegated/private), isGlobal checkbox
  (visible only to MANAGE_USERS; checking it disables project/assignees/visibility with explanatory
  hint mirroring gateway :86–93). Server validation errors map to fields/toast (ApiError payload).
- **Detail** (`task-detail-dialog`): full description (rendering `FIX (dd/mm/yyyy):` lines in a
  distinct "Ajustes solicitados" block), meta grid, assignees, per-user progress for public tasks,
  actions by permission: Editar (MANAGE_TASKS), Aprovar/Rejeitar (in-review + approver rule — reject
  requires reason via AlertDialog input), Concluir (assignee, non-leader-of-own-task), Excluir
  (MANAGE_TASKS, AlertDialog confirm).
- **Backlog import** (`backlog-dialog`): multiline textarea, one task per line → POST backlog;
  success toast shows createdCount.

### 5.3 Optimistic updates & invalidation (T2.3)
- Moves: snapshot previous list → apply → on ApiError restore snapshot + destructive toast
  (legacy parity :210–217) using TanStack `onMutate`/`onError` rollback.
- Invalidation map: any task mutation → `queryKeys.tasks.all`; complete/approve/reject → additionally
  `queryKeys.users.detail(me)` (points), `queryKeys.users.all` leaderboard slice, and
  `queryKeys.notifications.all` (server pushed TASK_* notifications).
- NO cross-context calls (D-5 couplings die here).

## 6. State Grid (constitution A1 — every cell implemented)
| State | Board | Dialogs |
|---|---|---|
| Loading | 5 skeleton columns ×3 shimmer cards | submit spinner; dialog opens instantly |
| Empty (no tasks at all) | "Nenhuma tarefa por aqui" + Nova Tarefa (if permitted) | — |
| Empty (filtered) | "Nenhuma tarefa corresponde aos filtros" + "Limpar filtros" | — |
| Error (list) | destructive Alert + "Tentar novamente" (refetch) | — |
| Mutation conflict | snapshot rollback + destructive toast w/ server message | field/toast error |
| Unauthorized (route) | server 307 → /login (T1.2) | — |
| Permission-denied (action) | blocked drag toast / hidden controls matching §2 | disabled buttons + hint |
| Empty column | "Nenhuma tarefa / Arraste uma tarefa aqui" | — |

## 7. Accessibility (D-15 obligations — acceptance criteria)
1. EVERY icon-only control has `aria-label` (pt-BR); dropdown triggers announce target.
2. Progress bars: `role="progressbar"` + `aria-label="Progresso de <tarefa>"` + valuemin/max/now.
3. Overdue banner and ATRASADA flag meet 4.5:1 contrast (use `text-destructive` token, not raw red-on-tint).
4. No nested interactive elements: DnD wrapper ≠ button role containing buttons; keyboard Move menu
   provides full parity (§5.1).
5. Dialogs: Radix focus trap, Esc close, focus return; forms announce errors (`aria-describedby`).

## 8. Responsive
- ≥lg: 5-column grid. <lg: horizontal scroll with snap; column min-width 280px.
- 320px: action row wraps (FIXES legacy overflow — D-15/CP-1 observation); filters collapse into
  a popover; compact view densifies cards (smaller paddings, single-line title).

## 9. Acceptance Criteria (observable)
1. COORDENADOR sees all tasks; VOLUNTARIO sees only public/global + assigned (matches API response).
2. Dragging a delegated task to Concluído as assignee: card lands in Em Revisão; toast "Enviada para
   Revisão"; leader receives TASK_REVIEW_REQUEST notification within poll interval.
3. Same drag as GERENTE_PROJETO project-leader: card lands in Concluído only after their own approve
   — direct drag by the leader on their OWN assigned task is blocked (server 400 "Líderes…").
4. Public task dragged to Em Andamento by VOLUNTARIO: card shows that volunteer's progress; another
   user still sees it as available.
5. Overdue public task completed: toast/points display reflects `points − daysLate×points`.
6. Reject with reason "X": detail dialog shows "FIX (dd/mm/yyyy): X" block; card back in Ajustes.
7. Non-leader drag from Concluído: no API call fired; destructive toast shown.
8. Filters reflected in URL; back/forward restore board state; share URL reproduces view.
9. All §7 axe checks pass on /dashboard (critical=0 whole page — superseding CP-1 shell scope).
10. Legacy import-count-zero: no file outside `features/tasks/` imports task-context/kanban legacy.

## 10. Test Scenarios
- **Unit**: demotion rule (pure fn `resolveMove(task, target, isLeader)`); archive threshold;
  penalty display calc; backlog line parser.
- **Component (MSW)**: board renders columns from fixture; empty/filtered/error states; card menu
  move parity; dialog validation (title required, points≥0, global disables fields).
- **Integration/contract**: handlers mirror route shapes (§4) and are asserted against `entities/task.ts`.
- **E2E (browser)**: login→board renders; drag delegated→review (data-rfd simulation via Move menu);
  leader approve→done→points badge updates; URL filter round-trip; keyboard-only move.

## 11. Out of Scope (this epic)
Task comments/history (no backend), subtasks (`parentId` orphan — backlog), real-time websockets (Q4),
mobile accordion board (backlog).
