# DisplayQuest API Contracts Inventory

Generated from backend modules and API routes. This is the authoritative contract reference.

## Convention
- All endpoints require authentication (NextAuth session cookie)
- Errors: `{ error: string }` with appropriate HTTP status
- Success: `{ data }` or `{ data, meta }`
- Pagination: `?page=1&limit=20` (where implemented)
- Filtering: `?field=value` (where implemented)

---

## Tasks API (`/api/tasks`)

### GET `/api/tasks`
**Query**: `userId`, `roles`, `projectId` (optional)
**Auth**: Any authenticated user
**Response**: `{ tasks: Task[] }`
**Backend**: `taskManagement.listTasksForActor({ actorId, actorRoles, projectId? })`

### POST `/api/tasks`
**Body**: `CreateTaskCommand` or `{ tasks: CreateTaskCommand[] }` (backlog)
**Auth**: `MANAGE_TASKS` permission
**Response**: `{ task: Task }` or `{ tasks: Task[], createdCount: number }`
**Backend**: `taskManagement.createTask()` or `createTaskBacklog()`

### GET `/api/tasks/[id]`
**Auth**: Any authenticated user (visibility rules apply)
**Response**: `{ task: Task }`

### PUT `/api/tasks/[id]`
**Body**: `UpdateTaskCommand`
**Auth**: `MANAGE_TASKS` or assignee (for status-only updates on delegated tasks)
**Response**: `{ task: Task }`

### PATCH `/api/tasks/[id]`
**Body**: `{ action: "complete", userId? }`
**Auth**: Assignee or `MANAGE_TASKS` / `MANAGE_USERS`
**Response**: `{ task: Task }`
**Backend**: `taskManagement.completeTask()`

### POST `/api/tasks/[id]/approve`
**Auth**: Project leader or `MANAGE_USERS`
**Response**: `{ task: Task }`
**Backend**: `taskManagement.approveTask()`

### POST `/api/tasks/[id]/reject`
**Body**: `{ reason?: string }`
**Auth**: Project leader or `MANAGE_USERS`
**Response**: `{ task: Task }`
**Backend**: `taskManagement.rejectTask()`

### DELETE `/api/tasks/[id]`
**Auth**: `MANAGE_TASKS`
**Response**: `{ success: boolean }`

### GET `/api/tasks/global-progress`
**Query**: `userId`
**Response**: `{ progress: TaskUserProgress[] }`

---

## Projects API (`/api/projects`)

### GET `/api/projects`
**Auth**: Any authenticated user (filtered by membership)
**Response**: `{ projects: Project[] }`
**Backend**: `projectManagement.listProjectsForActor()`

### POST `/api/projects`
**Body**: `ProjectFormData` (name, description, status, leaderId, volunteerIds, links)
**Auth**: `CREATE_PROJECT` (COORDENADOR, GERENTE, GERENTE_PROJETO)
**Response**: `{ project: Project }`

### GET `/api/projects/[id]`
**Auth**: Project member or `VIEW_ALL_DATA`
**Response**: `{ project: Project }`

### PUT `/api/projects/[id]`
**Body**: Partial Project
**Auth**: `EDIT_PROJECT` (COORDENADOR, GERENTE, GERENTE_PROJETO) + project access
**Response**: `{ project: Project }`

### DELETE `/api/projects/[id]`
**Auth**: `MANAGE_PROJECTS` + project access
**Response**: `{ success: boolean }`

### GET `/api/projects/[id]/members`
**Auth**: Project member or `VIEW_ALL_DATA`
**Response**: `{ members: ProjectMember[] }`

### POST `/api/projects/[id]/members`
**Body**: `{ userId, roles: UserRole[] }`
**Auth**: `MANAGE_PROJECT_MEMBERS`
**Response**: `{ membership: ProjectMember }`

### DELETE `/api/projects/[id]/members/[userId]`
**Auth**: `MANAGE_PROJECT_MEMBERS`
**Response**: `{ success: boolean }`

### GET `/api/projects/[id]/hours`
**Query**: `weekStart`, `weekEnd`
**Auth**: Project member or `VIEW_ALL_DATA`
**Response**: `{ hours: { totalHours, sessionCount, sessions[], hoursByUser[] } }`

### GET `/api/projects/[id]/hours-history`
**Auth**: Project member or `VIEW_ALL_DATA`
**Response**: `{ history: WeeklyHoursHistory[] }`

### GET `/api/projects/[id]/weekly-hours`
**Auth**: Project member or `VIEW_ALL_DATA`
**Response**: `{ weeklyHours: number }`

### GET `/api/projects/[id]/volunteers`
**Auth**: `MANAGE_PROJECT_MEMBERS` or project leader
**Response**: `{ volunteers: User[] }`

### GET `/api/projects/stats`
**Auth**: `VIEW_ALL_DATA`
**Response**: `{ stats: ProjectStats }`

---

## Users API (`/api/users`)

### GET `/api/users`
**Auth**: `VIEW_PROJECT_DASHBOARD` roles
**Response**: `{ users: User[] }` (fields filtered by role)

### POST `/api/users`
**Body**: `{ name, email, password, roles, weekHours }`
**Auth**: `MANAGE_USERS`
**Response**: `{ user: User }`

### GET `/api/users/[id]`
**Auth**: Self or `MANAGE_USERS`
**Response**: `{ user: User }`

### PUT `/api/users/[id]`
**Body**: Partial User
**Auth**: Self (profile) or `MANAGE_USERS`
**Response**: `{ user: User }`

### PATCH `/api/users/[id]`
**Body**: `{ action: "addPoints", points }`
**Auth**: `MANAGE_USERS`
**Response**: `{ user: User }`

### GET `/api/users/approve`
**Auth**: `APPROVE_USERS` (COORDENADOR, LABORATORISTA)
**Response**: `{ pendingUsers: User[] }`

### POST `/api/users/approve`
**Body**: `{ userId, action: "approve" | "reject" }`
**Auth**: `APPROVE_USERS`
**Response**: `{ user: User, message: string }`

### PATCH `/api/users/[id]/roles`
**Body**: `{ action: "set", roles: string[] }`
**Auth**: `MANAGE_USERS`
**Response**: `{ user: User }`

### GET `/api/users/[id]/project-hours`
**Query**: `weekStart`, `weekEnd`
**Auth**: Self or `VIEW_ALL_DATA`
**Response**: `{ hours: number }`

### GET `/api/users/[id]/gamification`
**Auth**: Self or `VIEW_ALL_DATA`
**Response**: `{ progression: UserProgression }`

### GET `/api/users/[id]/profile`
**Auth**: Based on `profileVisibility`
**Response**: `{ profile: UserProfile }`

### PATCH `/api/users/[id]/profile`
**Body**: Profile fields
**Auth**: Self
**Response**: `{ user: User }`

### GET `/api/users/profiles`
**Query**: `type=public|members`
**Auth**: Authenticated
**Response**: `{ users: UserProfile[] }`

### GET/POST `/api/users/[id]/avatar`
**Auth**: Self or `MANAGE_USERS`
**Response**: `{ avatar: string }`

### PATCH `/api/users/[id]/status`
**Body**: `{ action: "approve" | "reject" | "suspend" | "activate" }`
**Auth**: `MANAGE_USERS`
**Response**: `{ user: User }`

### PATCH `/api/users/[id]/deduct-hours`
**Body**: `{ hours, reason, projectId }`
**Auth**: `MANAGE_USERS` or project leader (`GERENTE_PROJETO`)
**Response**: `{ message, user: User }`

### GET `/api/users/leaderboard`
**Query**: `type=points|tasks`, `limit`
**Auth**: Authenticated
**Response**: `{ leaderboard: User[] }`

### GET `/api/users/statistics`
**Query**: `type=roles|status|general`
**Auth**: `MANAGE_USERS`
**Response**: `{ statistics: UserStatistics }`

---

## Work Sessions API (`/api/work-sessions`)

### GET `/api/work-sessions`
**Query**: `userId`, `status`, `active=true`
**Auth**: Self or `VIEW_ALL_DATA`
**Response**: `{ data: WorkSession[] }`

### POST `/api/work-sessions`
**Body**: `{ userId, userName, activity, location, projectId }`
**Auth**: Authenticated (self)
**Response**: `{ data: WorkSession }`
**Backend**: `workExecution.startWorkSession()`

### GET `/api/work-sessions/[id]`
**Auth**: Owner or `VIEW_ALL_DATA`
**Response**: `{ data: WorkSession }`

### PATCH `/api/work-sessions/[id]`
**Body**: `{ status, endTime, activity, dailyLogNote, dailyLogDate }`
**Auth**: Owner or `MANAGE_WORK_SESSIONS`
**Response**: `{ data: WorkSession }`
**Actions**: pause, resume, complete (with optional daily log creation)

### DELETE `/api/work-sessions/[id]`
**Auth**: Owner or `MANAGE_WORK_SESSIONS`
**Response**: `{ success: boolean }`

---

## Daily Logs API (`/api/daily_logs`)

### GET `/api/daily_logs`
**Query**: `userId`, `date`, `projectId`
**Auth**: Self or `VIEW_ALL_LOGS` (COORDENADOR) or project member
**Response**: `{ logs: DailyLog[] }`

### POST `/api/daily_logs`
**Body**: `{ userId, projectId, date, note }`
**Auth**: Authenticated
**Response**: `{ log: DailyLog }`

### GET/PUT/DELETE `/api/daily_logs/[id]`
**Auth**: Owner or `VIEW_ALL_LOGS`

---

## Rewards API (`/api/rewards`)

### GET/POST `/api/rewards`
**Auth**: GET: authenticated; POST: `MANAGE_REWARDS`
**Response**: `{ rewards: Reward[] }` / `{ reward: Reward }`

### GET/PUT/DELETE `/api/rewards/[id]`
**Auth**: GET: authenticated; PUT/DELETE: `MANAGE_REWARDS`

---

## Purchases API (`/api/purchases`)

### GET `/api/purchases`
**Query**: `userId` (optional)
**Auth**: Self (own) or `MANAGE_PURCHASES` / `APPROVE_PURCHASES` (all)
**Response**: `{ purchases: Purchase[] }`

### POST `/api/purchases`
**Body**: `{ userId, rewardId }`
**Auth**: Authenticated (self)
**Response**: `{ purchase: Purchase }` (status: pending)

### PATCH `/api/purchases/[id]`
**Body**: `{ action: "approve" | "deny" }`
**Auth**: `APPROVE_PURCHASES`
**Response**: `{ purchase: Purchase }`

---

## Lab Responsibilities API (`/api/responsibilities`)

### GET `/api/responsibilities`
**Query**: `startDate`, `endDate`, `active=true`
**Auth**: Authenticated
**Response**: `{ responsibilities: LabResponsibility[] }` or `{ activeResponsibility: LabResponsibility | null }`

### POST `/api/responsibilities`
**Body**: `{ userId, userName, notes }`
**Auth**: `ASSUME_LAB_RESPONSIBILITY` (COORDENADOR, LABORATORISTA)
**Response**: `{ responsibility: LabResponsibility }`

### PATCH `/api/responsibilities/[id]`
**Body**: `{ action: "end" | "updateNotes", userId?, notes? }`
**Auth**: Owner or `MANAGE_LABORATORY`

### DELETE `/api/responsibilities/[id]`
**Auth**: `MANAGE_LABORATORY`

---

## Laboratory Schedule API (`/api/laboratory-schedule`)

### GET/POST `/api/laboratory-schedule`
**Auth**: GET: authenticated; POST: `MANAGE_SCHEDULE`

### GET/PUT/DELETE `/api/laboratory-schedule/[id]`
**Auth**: `MANAGE_SCHEDULE`

---

## User Schedules API (`/api/schedules`)

### GET `/api/schedules`
**Query**: `userId` (optional)
**Auth**: Self or `MANAGE_SCHEDULE`

### POST/PUT/DELETE `/api/schedules/[id]`
**Auth**: Self or `MANAGE_SCHEDULE`

---

## Weekly Reports API (`/api/weekly-reports`)

### GET `/api/weekly-reports`
**Query**: `userId`, `weekStart`, `weekEnd`
**Auth**: Self or `VIEW_WEEKLY_REPORTS`

### POST `/api/weekly-reports`
**Body**: `{ userId, weekStart, weekEnd, summary }`
**Auth**: `VIEW_WEEKLY_REPORTS`

### POST `/api/weekly-reports/generate`
**Body**: `{ userId, weekStart, weekEnd }`
**Auth**: `VIEW_WEEKLY_REPORTS`
**Backend**: Aggregates work sessions + daily logs

### GET/PUT/DELETE `/api/weekly-reports/[id]`

---

## Project Reports API (`/api/project-reports`)

### GET/POST `/api/project-reports`
**Auth**: Project member or `VIEW_ALL_DATA`

### GET `/api/project-reports/[id]/aggregate`
**Query**: `periodType`, `periodStart`, `periodEnd`
**Response**: Aggregated project hours

### GET `/api/project-reports/[id]/export.csv`
**Response**: CSV download

### POST `/api/project-reports/[id]/attachments`
**Body**: FormData (file)
**Response**: `{ attachment: ReportAttachment }`

---

## Lab Events API (`/api/lab-events`)

### GET `/api/lab-events`
**Query**: `day`, `month`, `year`
**Auth**: Authenticated

### POST/DELETE `/api/lab-events/[id]`
**Auth**: Owner or `MANAGE_LABORATORY`

---

## Lab Notices API (`/api/lab-notices`)

### GET/POST `/api/lab-notices`
**Auth**: GET: authenticated; POST: authenticated

### DELETE `/api/lab-notices/[id]`
**Auth**: Owner or `MANAGE_LABORATORY`

---

## Issues API (`/api/issues`)

### GET/POST `/api/issues`
**Auth**: GET: authenticated; POST: authenticated

### GET/PUT/DELETE `/api/issues/[id]`

### POST `/api/issues/[id]/assign`
**Body**: `{ assigneeId }`
**Auth`: `MANAGE_TASKS` or project leader

### PATCH `/api/issues/[id]/status`
**Body**: `{ action: "start" | "resolve" | "closed" | "reopen" }`

### POST `/api/issues/[id]/resolve`
**Body**: `{ resolution }`

---

## Badges API (`/api/badges`)

### GET/POST `/api/badges`
**Auth**: GET: authenticated; POST: `MANAGE_BADGES`

### GET/PUT/DELETE `/api/badges/[id]`

### POST `/api/badges/award`
**Body**: `{ userId, badgeId }`
**Auth**: `MANAGE_BADGES`

---

## User Badges API (`/api/user-badges`)

### GET `/api/user-badges`
**Query**: `userId`, `limit`
**Response**: `{ badges: UserBadge[], recentBadges: UserBadge[], count: number }`

### DELETE `/api/user-badges/[userId]/[badgeId]`
**Auth**: `MANAGE_BADGES`

---

## Notifications API (`/api/notifications`)

### GET `/api/notifications`
**Query**: `unread=true`
**Auth**: Self
**Response**: `{ notifications: Notification[] }`

### PATCH `/api/notifications/[id]`
**Body**: `{ read: true }`
**Auth**: Self

### POST `/api/notifications/mark-all-read`
**Auth**: Self

---

## Health & Cron

### GET `/api/health`
**Auth**: None
**Response**: `{ status: "ok", timestamp }`

### GET `/api/cron/status`
**Auth**: `MANAGE_USERS`
**Response**: Cron job statuses

---

## TypeScript Contracts (To Be Generated)

Each endpoint needs:
1. **Request Zod Schema** (query + body)
2. **Response Zod Schema**
3. **TypeScript types** inferred from schemas
4. **Typed API client methods** using TanStack Query

Example pattern:
```typescript
// entities/tasks/api/tasks.api.ts
import { z } from "zod";
import { api } from "@/shared/lib/api";

export const TaskSchema = z.object({
  id: z.number(),
  title: z.string(),
  status: z.enum(["to-do", "in-progress", "in-review", "adjust", "done"]),
  // ...
});

export const ListTasksQuery = z.object({
  projectId: z.number().optional(),
});

export const listTasks = api.query({
  query: ListTasksQuery,
  response: z.object({ tasks: z.array(TaskSchema) }),
  endpoint: "/api/tasks",
});
```

---

## APPENDIX — REAL WIRE SHAPES (T0.5, verified from route source 2026-08-24)

Supersedes the "Convention" block above wherever they disagree. These are the envelopes the
typed layer (`lib/api/endpoints/*`) encodes in Zod.

| Endpoint | Real success envelope | Source |
|---|---|---|
| GET /api/tasks | `{ tasks: Task[] }` — Task = toJSON() shape below | route.ts:45 |
| GET /api/projects | `{ projects }` | route.ts:24 |
| POST /api/projects | `{ project }` (201) | route.ts:69 |
| GET/POST /api/users | `{ users }` / `{ user }` (201) | route.ts:16/:48 |
| ALL /api/work-sessions* | `{ data }` wrapper (list AND single, incl. POST 201) | route.ts:46,:60,:89,:151,:157 |
| GET /api/notifications | `{ success: true, notifications }` | route.ts:21 |
| errors | `{ error: string }` (+ optional `details` on work-sessions) | various |

### Task wire shape (`backend/models/Task.ts` toJSON :119–136)
```
{ id, title, description: string|null, status, priority,
  assignedTo: number|null, assigneeIds: number[],        ← flat ids, NOT task_assignees rows
  projectId: number|null, dueDate: string|null,          ← DB String column
  points, completed: boolean, completedAt: string(ISO)|null,
  taskVisibility, isGlobal }
```
### Dead calls CONFIRMED (D-3): `POST /api/badges/award`, `GET /api/users/search?q=` have NO route files.
### Purchase status domain: pending/approved/rejected/completed/cancelled (D-8; legacy delivered/processing rejected by schema).
