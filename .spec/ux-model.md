# DisplayQuest UX Model & Information Architecture

## User Personas & Goals

### 1. Coordenador / Gerente (Lab Leadership)
- **Goals**: Oversee all lab activity; manage users, projects, rewards; approve purchases; view system-wide reports
- **Key Flows**: Admin dashboard, user management, project oversight, reward management, weekly reports
- **Pain Points**: Too many tabs; fragmented data across pages; no executive summary view

### 2. Laboratorista (Lab Staff)
- **Goals**: Manage lab responsibility schedule; post notices/events; approve users/purchases; view all logs
- **Key Flows**: Lab dashboard (responsibility, schedule, notices), user approval, purchase approval
- **Pain Points**: Calendar view clunky; responsibility handoff not smooth

### 3. Gerente de Projeto (Project Manager)
- **Goals**: Manage project tasks & members; track project hours; approve/reject task submissions; generate project reports
- **Key Flows**: Project dashboard (kanban + stats), member management, task review, project reports
- **Pain Points**: Kanban mixes project + global tasks; hard to see project-only view; member management buried in dialogs

### 4. Pesquisador / Colaborador (Core Contributors)
- **Goals**: View assigned tasks; update task status; log work sessions; create daily logs; purchase rewards
- **Key Flows**: Personal kanban, work session timer, daily logs, store
- **Pain Points**: Can't filter "my tasks" vs "project tasks" clearly; work session timer floats but hard to access

### 5. Voluntário (Volunteer)
- **Goals**: View public/global tasks; pick up tasks; complete for points; log hours
- **Key Flows**: Public task board, work sessions, store
- **Pain Points**: Public task progress not visible; no clear onboarding

---

## Current Information Architecture (Sitemap)

```
/ (landing) -> /login | /register
/dashboard (Kanban - all tasks)
/dashboard/projetos (Projects: List | Dashboard | Volunteers)
/dashboard/loja (Store: Rewards | My Purchases | Approvals | Manage)
/dashboard/laboratorio (Lab: Schedule | Responsibility | Issues)
/dashboard/weekly-reports (Reports: Users | Projects)
/dashboard/admin (Admin: Users, Hours, Projects, Badges, Schedule)
/dashboard/leaderboard (Leaderboard)
/dashboard/profile (Profile)
/dashboard/project-reports/[id]/print (Print view)
```

### Navigation Issues
1. **Dashboard** shows ALL tasks (global + project) - no project filter for non-managers
2. **Projetos** has 3 tabs but only visible to Gerente Projeto+; Volunteers tab duplicate of member management
3. **Laboratorio** mixes 3 distinct domains (schedule, responsibility, issues) in tabs
4. **Loja** has 4 tabs but only 2 for regular users; approvals/manage hidden behind permissions
5. **No global search** or command palette
6. **Breadcrumbs missing** on deep pages (project-reports print, etc.)

---

## Target Information Architecture

### Global Navigation (Persistent Header)
```
Display Quest [Logo]
├── Dashboard (Kanban)          → /dashboard
├── Projects                    → /dashboard/projects
│   ├── All Projects            → /dashboard/projects
│   ├── My Projects             → /dashboard/projects?mine=true
│   └── Create Project          → /dashboard/projects/new
├── Laboratory                  → /dashboard/lab
│   ├── Schedule                → /dashboard/lab/schedule
│   ├── Responsibility          → /dashboard/lab/responsibility
│   └── Issues                  → /dashboard/lab/issues
├── Store                       → /dashboard/store
│   ├── Rewards                 → /dashboard/store
│   ├── My Purchases            → /dashboard/store/purchases
│   └── Approvals (permission)  → /dashboard/store/approvals
├── Reports                     → /dashboard/reports
│   ├── Weekly (Users)          → /dashboard/reports/weekly
│   └── Project Reports         → /dashboard/reports/projects
└── Profile Menu (avatar)
    ├── Profile                 → /dashboard/profile
    ├── Leaderboard             → /dashboard/leaderboard
    ├── Settings                → /dashboard/settings
    └── Logout
```

### Role-Based Visibility
| Route | COORDENADOR/GERENTE | LABORATORISTA | GERENTE_PROJETO | PESQUISADOR/COLABORADOR | VOLUNTARIO |
|-------|---------------------|---------------|-----------------|------------------------|------------|
| /dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| /dashboard/projects | ✓ | | ✓ | ✓ | ✓ |
| /dashboard/projects/new | ✓ | | ✓ | | |
| /dashboard/lab/schedule | ✓ | ✓ | | | |
| /dashboard/lab/responsibility | ✓ | ✓ | | | |
| /dashboard/lab/issues | ✓ | ✓ | ✓ | ✓ | ✓ |
| /dashboard/store | ✓ | ✓ | ✓ | ✓ | ✓ |
| /dashboard/store/approvals | ✓ | ✓ | ✓ | | |
| /dashboard/store/manage | ✓ | ✓ | ✓ | | |
| /dashboard/reports/weekly | ✓ | ✓ | ✓ | | |
| /dashboard/reports/projects | ✓ | | ✓ | | |
| /dashboard/admin | ✓ | | | | |
| /dashboard/leaderboard | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Key User Flows (To Be Specified)

### Flow 1: Task Management (Core)
```
User lands on /dashboard
  -> Sees Kanban with columns: To-Do | In Progress | In Review | Adjust | Done
  -> Filters: Project (select), Assignee (me/all), Status, Overdue
  -> Drag task between columns
    -> To "In Review": Creates notification for project leader
    -> To "Done" (public/global): Awards points immediately
    -> To "Done" (delegated): Goes to "In Review"
  -> Click task -> Detail dialog (comments, history, assignees, time tracking)
  -> "New Task" -> Dialog with form (title, desc, project, assignees, due date, points, visibility)
  -> "Backlog" -> Bulk create dialog
```

### Flow 2: Work Session + Daily Log
```
User clicks "Start Session" (floating timer or lab page)
  -> Select project (optional), activity, location
  -> Timer starts floating (persistent across navigation)
  -> User works...
  -> User clicks "Pause" or "End"
    -> If "End": Prompt for activity summary -> Creates Daily Log automatically
    -> If "Pause": Duration preserved; can resume later
  -> Daily Logs viewable in Lab > Schedule tab (calendar)
```

### Flow 3: Lab Responsibility Handoff
```
Laboratorista views /dashboard/lab/responsibility
  -> Sees current responsible person + duration
  -> If none: "Assume Responsibility" + optional notes
  -> If self: "End Responsibility" + optional notes
  -> History shows all shifts with durations
  -> Calendar view shows schedule + events + responsibilities
```

### Flow 4: Reward Purchase
```
User visits /dashboard/store
  -> Sees available rewards (cards: name, desc, price, "Redeem" button)
  -> Clicks "Redeem" -> Confirmation dialog (shows points balance)
  -> Confirms -> Purchase created (status: pending)
  -> Admin/Laboratorista sees in Approvals tab
  -> Approves -> Points deducted, status: approved
  -> User sees in "My Purchases" with status badge
```

### Flow 5: Project Report Generation
```
Gerente Projeto visits /dashboard/reports/projects
  -> Selects project + week range
  -> Clicks "Generate" -> Aggregates work sessions for project in week
  -> Shows preview: total hours, sessions, contributors, session list
  -> Can save as ProjectReport (with title, content, attachments)
  -> Can export CSV
  -> Print view for formal reporting
```

---

## Screen States Inventory (Per Major Screen)

### Kanban Board (/dashboard)
| State | Description |
|-------|-------------|
| Loading | Skeleton columns (5) with 3 placeholder cards each |
| Empty (no tasks) | "No tasks found" + "Create Task" CTA |
| Empty (filtered) | "No tasks match filters" + "Clear filters" |
| Error | Inline alert + "Retry" button |
| Partial Error | Columns render; failed column shows error |
| Drag Active | Visual feedback (opacity, shadow, drop zones) |
| Optimistic Update | Card moves instantly; subtle "syncing" indicator |
| Conflict | Server rejects -> toast + revert + "Retry" |

### Project List (/dashboard/projects)
| State | Description |
|-------|-------------|
| Loading | Skeleton cards (6) |
| Empty | "No projects" + "Create Project" (if permitted) |
| Grid View | Cards: name, status badge, member count, task progress ring |
| List View | Table: name, status, leader, members, tasks, actions |
| Detail Dialog | Tabs: Overview, Members, Tasks, Reports, Settings |

### Store (/dashboard/store)
| State | Description |
|-------|-------------|
| Loading Rewards | Skeleton cards |
| Empty Rewards | "No rewards available" |
| Purchase Pending | Toast "Submitted for approval" |
| Purchase Approved | Toast "Approved! Points deducted" + update balance |
| Purchase Rejected | Toast "Rejected: reason" + points restored |
| Approvals Tab (admin) | Table: user, reward, price, date, actions (Approve/Deny) |

### Lab Responsibility (/dashboard/lab/responsibility)
| State | Description |
|-------|-------------|
| No Active | "Lab available" + "Assume" button (if permitted) |
| Active (self) | Timer + "End" button + notes field |
| Active (other) | "Currently: Name since HH:MM" + duration |
| History | Collapsible list by month |

---

## Accessibility Requirements

### WCAG 2.1 AA Minimum
- **Color Contrast**: 4.5:1 text, 3:1 UI components (verified via design tokens)
- **Keyboard Navigation**: All interactive elements reachable; focus visible; logical tab order
- **Screen Readers**: Semantic HTML; ARIA labels for icon-only buttons; live regions for toasts/timers
- **Focus Management**: Dialogs trap focus; return focus on close; skip links
- **Reduced Motion**: Respect `prefers-reduced-motion` for animations/transitions
- **Touch Targets**: Minimum 44x44px (mobile)
- **Forms**: Labels associated; error messages announced; required indicators

### Specific Component Requirements
- **Kanban**: Keyboard drag-drop alternative (arrow keys + Enter/Space); column headers as landmarks
- **Floating Timer**: Announce time updates politely; keyboard accessible
- **Calendar**: Grid navigation with arrow keys; today highlighted; event details on Enter
- **Data Tables**: Sortable headers (ARIA sort); row selection; pagination announced
- **Dialogs**: `role="dialog"`; `aria-modal="true"`; focus trap; Esc to close

---

## Responsive Breakpoints

| Breakpoint | Width | Target Devices |
|------------|-------|----------------|
| `sm` | 640px | Large phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large screens |

### Component Adaptations
- **Kanban**: Horizontal scroll < lg; stacked columns on mobile (accordion)
- **Header**: Hamburger menu < md; full nav ≥ md
- **Tables**: Horizontal scroll < lg; card layout on mobile
- **Forms**: Full-width inputs < md; side-by-side ≥ md
- **Dialogs**: Full-screen on mobile; centered ≥ md

---

## Design Direction (Principles)

### Visual Language
- **Not generic SaaS**: Avoid excessive cards, gradients, glassmorphism, decorative dashboards
- **Functional density**: Information-dense where appropriate (kanban, tables); breathing room for reading
- **Clear hierarchy**: Typography scale (display, heading, body, caption); semantic color tokens
- **Purposeful motion**: Subtle transitions (150-200ms); loading skeletons; drag feedback
- **Lab aesthetic**: Clean, technical, trustworthy — not playful or consumer-grade

### Color System (Semantic Tokens)
```
--background, --foreground
--card, --card-foreground
--popover, --popover-foreground
--primary, --primary-foreground (brand action color)
--secondary, --secondary-foreground
--muted, --muted-foreground
--accent, --accent-foreground
--destructive, --destructive-foreground
--success, --success-foreground
--warning, --warning-foreground
--info, --info-foreground
--border, --input, --ring
--radius (base radius)
```

### Status Colors (Semantic, not decorative)
- **To-Do**: Muted
- **In Progress**: Primary (blue)
- **In Review**: Warning (amber)
- **Adjust**: Destructive (red)
- **Done**: Success (green)
- **Public Task**: Info (cyan) indicator
- **Global Task**: Primary + icon

### Typography Scale
- Display: 48px / 1.1 (page titles)
- H1: 36px / 1.2
- H2: 30px / 1.3
- H3: 24px / 1.4
- H4: 20px / 1.4
- Body: 16px / 1.6
- Small: 14px / 1.5
- Caption: 12px / 1.5
- Mono: 13px / 1.6 (timers, code, IDs)

---

## Unresolved UX Questions

1. **Global vs Project Task View**: Should `/dashboard` show only "my tasks" by default with project filter, or all tasks? Current: all tasks.
2. **Work Session Timer**: Floating vs integrated in header vs dedicated page? Current: floating + lab page.
3. **Onboarding**: First-time user flow for volunteers (public tasks, points, store)?
4. **Notifications**: In-app only? Email? Push? Current: in-app only.
5. **Mobile Kanban**: Accordion columns vs horizontal scroll vs separate "board" view?
6. **Project Report Print**: PDF generation vs print CSS? Current: print page.
7. **Dark Mode**: Complete? Current: partial (some components not adapted).

---

## Migration Priority (UX-First)

1. **Kanban Board** - Core daily workflow; highest impact
2. **Work Session Timer** - High frequency; unique value prop
3. **Lab Responsibility** - Time-sensitive; safety-critical
4. **Store/Purchases** - Gamification loop closure
5. **Project Reports** - Manager workflow; high value
6. **Admin Panel** - Low frequency but high complexity
7. **Profile/Leaderboard** - Low priority; polish later
