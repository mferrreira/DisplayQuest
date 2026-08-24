# DisplayQuest Product Model

Inferred from Prisma schema, backend modules, and frontend behavior.

## Core Domain Entities

### User
- **Identity**: id, name, email, password (hashed), avatar, bio, profileVisibility
- **Roles**: COORDENADOR, GERENTE, LABORATORISTA, PESQUISADOR, GERENTE_PROJETO, COLABORADOR, VOLUNTARIO (multi-role)
- **Status**: pending, active, rejected, suspended
- **Gamification**: points, completedTasks, currentWeekHours, weekHours, badges (UserBadge[])
- **Relationships**: projectMemberships, ledProjects, createdProjects, tasks, taskAssignments, workSessions, dailyLogs, notifications, purchases, schedules

### Project
- **Identity**: id, name, description, createdAt, status (active/completed/archived), links
- **Leadership**: createdBy (User), leaderId (User, optional)
- **Members**: ProjectMember[] (User + roles per project)
- **Content**: tasks[], workSessions[], projectReports[]

### Task
- **Identity**: id, title, description, status (to-do|in-progress|in-review|adjust|done), priority (low|medium|high)
- **Assignment**: assignedTo (single, legacy), assigneeIds[] (multi-assignee via TaskAssignee), projectId (optional)
- **Visibility**: taskVisibility (public|delegated|private), isGlobal (lab-wide task)
- **Gamification**: points, completed, completedAt
- **Progress Tracking**: TaskUserProgress per assignee (status, pickedAt, completedAt, awardedPoints) — for public tasks

### WorkSession
- **Identity**: id, userId, userName, startTime, endTime, duration, activity, location, projectId, status (active|completed|paused)
- **Tasks**: WorkSessionTask[] (many-to-many with tasks)
- **Daily Log**: optional one-to-one with DailyLog

### DailyLog
- **Identity**: id, userId, projectId, date, note, workSessionId (unique)
- **Purpose**: Narrative record of work done, linked to work session

### ProjectReport
- **Identity**: id, projectId, authorId, periodType, periodStart, periodEnd, title, content
- **Attachments**: ReportAttachment[]

### Reward / Purchase (Gamification Store)
- **Reward**: id, name, description, price (points), available
- **Purchase**: id, userId, rewardId, rewardName, price, purchaseDate, status (pending/approved/rejected/used)

### LabResponsibility
- **Identity**: id, userId, userName, startTime, endTime, notes
- **Purpose**: Track who is responsible for the lab at any time

### LaboratorySchedule
- **Identity**: id, dayOfWeek, startTime, endTime, notes
- **Purpose**: Default lab operating hours per day

### UserSchedule
- **Identity**: id, userId, dayOfWeek, startTime, endTime
- **Purpose**: Individual user availability per day

### LabEvent
- **Identity**: id, userId, userName, date, note
- **Purpose**: Ad-hoc lab events/annotations on calendar

### LabNotice
- **Identity**: id, note, createdAt
- **Purpose**: Persistent lab-wide announcements

### Issue
- **Identity**: id, title, description, status (open|in_progress|resolved|closed), priority (low|medium|high|urgent), category
- **Actors**: reporterId, assigneeId

### Badge / UserBadge (Gamification)
- **Badge**: id, name, description, icon, color, category (achievement|milestone|special|social), criteria (JSON), isActive, createdBy
- **UserBadge**: id, userId, badgeId, earnedAt, earnedBy

### WeeklyReport / WeeklyHoursHistory
- **WeeklyReport**: id, userId, userName, weekStart, weekEnd, totalLogs, summary
- **WeeklyHoursHistory**: id, userId, userName, weekStart, weekEnd, totalHours

### Notification
- **Identity**: id, userId, type, title, message, data (JSON), read, createdAt, readAt

## Domain State Machines

### Task Visibility Model
```
PUBLIC (taskVisibility="public", isGlobal=false)
  -> Individual progress tracked via TaskUserProgress
  -> Anyone can pick up and complete
  -> Points awarded on completion per user

DELEGATED (taskVisibility="delegated")
  -> Assigned to specific user(s) via assigneeIds
  -> Completion -> "in-review" -> approval by leader/manager -> "done" + points

PRIVATE (taskVisibility="private")
  -> Restricted to assignees
  -> Similar to delegated but stricter visibility

GLOBAL (isGlobal=true)
  -> taskVisibility forced to "public"
  -> Lab-wide task, no project
  -> Created only by COORDENADOR/GERENTE
```

### Task Lifecycle
```
TO-DO
  -> IN-PROGRESS (user starts work)
    -> IN-REVIEW (user submits for review, delegated/private tasks)
      -> DONE (approved) + points awarded
      -> ADJUST (rejected) -> back to IN-PROGRESS
    -> DONE (direct, public/global tasks) + points awarded
  -> ADJUST (if rejected from IN-REVIEW)
```

### WorkSession Lifecycle
```
CREATED (startTime set, status="active")
  -> PAUSED (duration accumulated, status="paused")
    -> ACTIVE (resumed, new startTime)
  -> COMPLETED (endTime set, duration finalized, status="completed")
    -> DAILY_LOG_CREATED (optional, from session)
```

### User Status
```
PENDING (registered, awaiting approval)
  -> ACTIVE (approved by COORDENADOR/LABORATORISTA)
  -> REJECTED
ACTIVE
  -> SUSPENDED
  -> REJECTED
```

### Purchase Lifecycle
```
PENDING (user requests)
  -> APPROVED (by COORDENADOR/GERENTE/LABORATORISTA) -> points deducted
  -> REJECTED -> points returned
APPROVED
  -> USED (when reward consumed)
```

## Role Permission Matrix (from FEATURE_ACCESS)

| Feature | COORDENADOR | GERENTE | LABORATORISTA | GERENTE_PROJETO | PESQUISADOR | COLABORADOR | VOLUNTARIO |
|---------|-------------|---------|---------------|-----------------|-------------|-------------|------------|
| DASHBOARD_ADMIN | ✓ | ✓ | | | | | |
| DASHBOARD_WEEKLY_REPORTS | ✓ | ✓ | ✓ | | | | |
| VIEW_PROJECT_DASHBOARD | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ |
| MANAGE_REWARDS | ✓ | ✓ | ✓ | | | | |
| MANAGE_USERS | ✓ | ✓ | | | | | |
| MANAGE_PROJECTS | ✓ | ✓ | | ✓ | | | |
| MANAGE_TASKS | ✓ | ✓ | | ✓ | ✓ | ✓ | |
| MANAGE_PROJECT_MEMBERS | ✓ | ✓ | | ✓ | | | |
| MANAGE_SCHEDULE | ✓ | ✓ | ✓ | | | | |
| MANAGE_BADGES | ✓ | ✓ | ✓ | | | | |
| VIEW_ALL_DATA | ✓ | ✓ | ✓ | | | | |
| VIEW_WEEKLY_REPORTS | ✓ | ✓ | ✓ | | | | |
| EDIT_PROJECT | ✓ | ✓ | | ✓ | | | |
| EDIT_TASKS | ✓ | ✓ | | ✓ | | ✓ | |
| CREATE_TASK | ✓ | ✓ | | ✓ | ✓ | ✓ | |
| CREATE_PROJECT | ✓ | ✓ | | ✓ | | | |
| MANAGE_LABORATORY | ✓ | | ✓ | | | | |
| ASSUME_LAB_RESPONSIBILITY | ✓ | | ✓ | | | | |
| COMPLETE_PUBLIC_TASKS | ✓ | ✓ | | ✓ | | ✓ | ✓ |
| ASSIGN_TASKS_TO_VOLUNTEERS | ✓ | ✓ | | ✓ | | ✓ | |
| APPROVE_USERS | ✓ | | ✓ | | | | |
| APPROVE_PURCHASES | ✓ | ✓ | ✓ | | | | |
| VIEW_ALL_LOGS | ✓ | | | | | | |
| EDIT_OWN_LOGS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Key Domain Rules

1. **Task Assignment**: Multi-assignee via task_assignees table; assignedTo kept for backward compat
2. **Public Task Progress**: Per-user progress tracked in task_user_progress; completion awards points individually
3. **Delegated Task Approval**: Requires project leader or manager approval; points awarded on approval
4. **Global Tasks**: Only COORDENADOR/GERENTE can create; visible to all; no project
5. **Lab Responsibility**: Only COORDENADOR/LABORATORISTA can assume; one active at a time
6. **Weekly Hours**: Tracked via work sessions; reset weekly via cron
7. **Gamification**: Points from task completion + work sessions; badges awarded via rules engine
8. **Project Membership**: User can have different roles per project; project leader has elevated permissions
9. **Notifications**: Event-driven (task review requests, approvals, rejections, purchases, etc.)
