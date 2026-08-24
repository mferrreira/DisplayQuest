# DisplayQuest Frontend Architecture Audit

> **STATUS:** as-is audit + target. Phases −1/0 complete; see EXECUTION-PLAN.md for live task graph.

# DisplayQuest Frontend Architecture Audit

## Current Architecture (As-Is)

### Structure
```
app/                    # Next.js 15 App Router
  layout.tsx            # Root layout -> ClientLayout
  client-layout.tsx     # Providers: SessionProvider, ThemeProvider, UserProvider, ProjectProvider, TaskProvider, WorkSessionsProvider
  page.tsx              # Landing (redirects to dashboard)
  login/page.tsx        # Login page
  register/page.tsx     # Registration page
  dashboard/
    page.tsx            # Kanban board (main dashboard)
    projetos/page.tsx   # Projects management
    loja/page.tsx       # Store (rewards/purchases)
    laboratorio/page.tsx # Lab responsibility, schedule, issues
    weekly-reports/page.tsx # Weekly reports
    admin/page.tsx      # Admin panel
    leaderboard/page.tsx # Points leaderboard
    profile/page.tsx    # User profile
  api/                  # API routes (47 endpoints)
    tasks/              # Task CRUD + approve/reject + global-progress
    projects/           # Project CRUD + members + hours + stats
    users/              # User CRUD + roles + status + gamification + points
    work-sessions/      # Session CRUD
    daily_logs/         # Daily log CRUD
    weekly-reports/     # Report CRUD + generate
    project-reports/    # Project report CRUD + aggregate + export
    rewards/            # Reward CRUD
    purchases/          # Purchase CRUD + approve/deny
    badges/             # Badge CRUD + award
    user-badges/        # User badge queries
    lab-notices/        # Lab notice CRUD
    lab-events/         # Lab event CRUD
    laboratory-schedule/ # Lab schedule CRUD
    schedules/          # User schedule CRUD
    responsibilities/   # Lab responsibility CRUD
    issues/             # Issue CRUD + assign/status/resolve
    notifications/      # Notification CRUD + mark-all-read
    auth/               # NextAuth + register
    health/             # Health check
    cron/               # Cron status

components/
  ui/                   # 60+ shadcn/ui components (button, card, dialog, table, kanban-*, etc.)
  features/             # 18 feature components (kanban-board, task-dialog, project-list, issue-management, etc.)
  forms/                # 8 form components (task-form, project-members-manager, user-profile-form, etc.)
  admin/                # 7 admin components
  layout/               # 4 layout components (app-header, mobile-menu, theme-provider, theme-toggle)

contexts/               # 13 React Context providers (state management)
  api-client.ts         # Centralized API client (fetchAPI + 13 domain APIs)
  auth-context.tsx      # Thin wrapper around next-auth useSession
  task-context.tsx      # Task state + mutations
  project-context.tsx   # Project state + mutations
  user-context.tsx      # User state + mutations
  reward-context.tsx    # Reward/Purchase state + mutations
  work-sessions-context.tsx # WorkSession state + mutations
  responsibility-context.tsx # LabResponsibility state
  laboratory-schedule-context.tsx # LabSchedule state
  lab-events-context.tsx # LabEvent state
  lab-notices-context.tsx # LabNotice state
  issue-context.tsx     # Issue state
  weekly-report-context.tsx # WeeklyReport state
  notification-context.tsx # Notification state
  use-toast.ts          # Toast state (sonner)
  use-mobile.tsx        # Mobile breakpoint hook

hooks/                  # 3 hooks (wrappers around contexts)
  use-daily-logs.ts
  use-project-members.ts
  use-work-sessions.ts

lib/
  auth/                 # RBAC, next-auth config, api-guard, server-auth, features
  database/             # Prisma client
  services/             # Cron service
  storage/              # Report uploads
  utils/                # cn(), access-control, validation, time utils
```

### State Management Pattern (Current)
- **13 React Context providers** stacked in client-layout.tsx
- Each context: `useState` for data, `useCallback` for mutations, `useEffect` for initial fetch
- Mutations: optimistic updates via `setTasks(prev => ...)` then API call, rollback on error via refetch
- No caching layer; every context fetches independently on mount
- No invalidation strategy; manual `fetchX()` calls after mutations
- Cross-context dependencies: e.g., `TaskContext` calls `UserContext.fetchUsers()` after task completion

### Data Fetching Pattern
- **Client-side only**: All data fetching in `useEffect` inside contexts
- **No server components** for data fetching (except root layout for session)
- **API client**: `contexts/api-client.ts` with `fetchAPI` wrapper
- **Error handling**: Try/catch in each context method, error state per context
- **Loading states**: Per-context boolean loading flags

### Component Patterns
- **Feature components**: Large, monolithic (kanban-board.tsx: 367 lines, laboratorio/page.tsx: 738 lines)
- **UI components**: shadcn/ui primitives + custom compositions
- **Forms**: react-hook-form + zod validation (task-form, issue-form, etc.)
- **Dialogs**: Radix Dialog via shadcn/ui pattern
- **Drag & Drop**: @hello-pangea/dnd for Kanban

### Styling
- **Tailwind CSS v3** (config uses `tailwindcss-animate` plugin)
- **CSS variables** for theming (defined in globals.css, not shown)
- **class-variance-authority** for component variants (button, badge, etc.)
- **Dark mode**: `next-themes` with `class` strategy

### Authentication
- **NextAuth v4** (credentials provider)
- **Middleware**: Only handles `/uploads/avatars/*` (WebP headers)
- **API Guard**: `requireApiActor()`, `ensurePermission()` in `lib/auth/api-guard.ts`
- **Server Auth**: `requireAuth()`, `requireRole()`, `requirePermission()` in `lib/auth/server-auth.ts`
- **Client Auth**: `useAuth()` context wraps `useSession()`

### Backend Integration (Composition Root)
- **Singleton**: `getBackendComposition()` returns wired modules
- **Modules**: 11 modules (identity-access, user-management, project-management, project-membership, task-management, work-execution, reporting, gamification, store, notifications, lab-operations)
- **API Routes**: Thin handlers -> `getBackendComposition()` -> module method
- **Contracts**: Each module defines `contracts.ts` (DTOs), `ports/` (interfaces), `use-cases/`, `infrastructure/`

## Architectural Problems Identified

### 1. Context Explosion (13 Providers)
- **Problem**: 13 nested providers in `client-layout.tsx`; conditional `TaskProvider` based on pathname
- **Impact**: Re-renders cascade; hard to trace data flow; testing requires wrapping in all providers
- **Root Cause**: Treating every domain as global state

### 2. No Server State Management
- **Problem**: All fetching client-side in `useEffect`; no caching, deduplication, or stale-while-revalidate
- **Impact**: Duplicate fetches (e.g., `TaskContext` + `ProjectContext` both fetch on mount); no background refresh; manual refetch everywhere
- **Missing**: TanStack Query / SWR / React Query

### 3. Optimistic Updates Are Ad-Hoc
- **Problem**: Each context manually implements `setOptimisticTasks` pattern; no standardized rollback
- **Impact**: Inconsistent UX; race conditions; no retry logic
- **Example**: `kanban-board.tsx` lines 39, 71-73, 152-220

### 4. Cross-Context Coupling
- **Problem**: `TaskContext.completeTask()` calls `UserContext.fetchUsers()` (line 148)
- **Impact**: Tight coupling; circular dependency risk; hard to test in isolation

### 5. Monolithic Feature Components
- **Problem**: `kanban-board.tsx` (367 lines), `laboratorio/page.tsx` (738 lines), `loja/page.tsx` (494 lines), `weekly-reports/page.tsx` (532 lines)
- **Impact**: Hard to test; mixed concerns (data fetching, UI, business logic); not reusable

### 6. No URL State Management
- **Problem**: Filters, pagination, tabs, selected items all in `useState`
- **Impact**: Not shareable/bookmarkable; browser back/forward broken; no SSR support for filters

### 7. API Client Is Not Typed
- **Problem**: `fetchAPI` returns `any`; domain APIs use `any[]`; no TypeScript contracts for requests/responses
- **Impact**: No compile-time API contract verification; runtime errors only

### 8. Form Handling Inconsistent
- **Problem**: Some forms use `react-hook-form` + zod (task-form), others use raw `useState` (lab notices, events)
- **Impact**: Inconsistent validation UX; duplicated validation logic

### 9. Error Handling Fragmented
- **Problem**: Per-context error state; no global error boundary; toast notifications via `use-toast` context
- **Impact**: Errors don't bubble consistently; no retry UI; no offline support

### 10. No Testing Infrastructure
- **Problem**: No test files found; no Vitest/Playwright config; no MSW for API mocking
- **Impact**: No regression protection; manual QA only

### 11. TypeScript Types Duplicated
- **Problem**: `contexts/types.ts` (577 lines) mirrors Prisma schema but diverges (e.g., `Task.status` string vs enum)
- **Impact**: Drift risk; single source of truth violated

### 12. Components Import Contexts Directly
- **Problem**: Feature components import `useTask`, `useProject`, `useUser`, etc. directly
- **Impact**: Cannot test components without full provider tree; not portable

### 13. Conditional Provider Mounting
- **Problem**: `TaskProvider` only mounted on certain paths (client-layout.tsx lines 16-20)
- **Impact**: Hook throws if used outside those paths; implicit coupling to routing

### 14. Legacy Patterns
- **Problem**: `class-variance-authority` + `tailwindcss-animate` (v3 patterns); no `@theme` directive (v4)
- **Impact**: Not using modern Tailwind v4 features; larger CSS output

## Target Architecture (To-Be)

### Directory Structure
```
app/
  (auth)/               # Auth route group (login, register)
  (dashboard)/          # Dashboard route group (protected)
    layout.tsx          # Dashboard layout + providers
    page.tsx            # Kanban (server component + client island)
    projetos/           # Projects feature
    loja/               # Store feature
    laboratorio/        # Lab feature
    weekly-reports/     # Reports feature
    admin/              # Admin feature
    leaderboard/        # Leaderboard feature
    profile/            # Profile feature
  api/                  # API routes (unchanged, backend-owned)

features/               # Feature-scoped modules (NEW)
  tasks/
    components/         # KanbanBoard, TaskCard, TaskDialog, TaskDetailDialog, BacklogDialog
    hooks/              # useTasks, useTaskMutations, useTaskFilters
    api/                # Typed API client (generated from backend contracts)
    types/              # Task, TaskFormData, TaskFilters (Zod schemas)
    utils/              # Task helpers (overdue, archive, etc.)
  projects/
  users/
  rewards/
  work-sessions/
  laboratory/
  reports/
  gamification/
  notifications/

entities/               # Shared domain types (NEW)
  user.ts
  project.ts
  task.ts
  work-session.ts
  ...

shared/
  ui/                   # shadcn/ui primitives (Button, Card, Dialog, etc.)
  hooks/                # useDebounce, useLocalStorage, useMediaQuery, etc.
  utils/                # cn(), formatters, validators
  providers/            # AuthProvider, ThemeProvider, QueryProvider

lib/
  api/                  # Typed API client (TanStack Query + MSW handlers)
  auth/                 # Auth utilities (unchanged)
  db/                   # Prisma (server-only)
  config/               # App config
  validation/           # Zod schemas (shared with backend where possible)
```

### Data Flow (New)
```
Server Component (RSC)
  -> fetch data via typed API client (TanStack Query prefetch)
  -> pass as props to Client Components

Client Component (Feature)
  -> useQuery / useMutation from feature-specific hooks
  -> optimistic updates via useMutation.onMutate
  -> invalidation via queryClient.invalidateQueries
  -> URL state via nuqs (useQueryState)

Global Providers (minimal)
  -> SessionProvider (next-auth)
  -> ThemeProvider (next-themes)
  -> QueryProvider (TanStack Query)
  -> AuthProvider (user info from session)
  -> Toaster (sonner)
```

### State Classification

| State Type | Examples | Solution |
|------------|----------|----------|
| Server State | Tasks, Projects, Users, WorkSessions, Rewards, Reports | TanStack Query |
| Client Ephemeral | Dialog open/closed, form input, sidebar collapsed | Local useState / Zustand |
| URL State | Filters, pagination, selected tab, sort order | nuqs (useQueryState) |
| Auth State | User session, roles, permissions | next-auth SessionProvider + AuthContext |
| Theme State | Dark/light mode | next-themes ThemeProvider |

## Migration Approach

### Phase 1: Infrastructure (Week 1)
1. Add TanStack Query, nuqs, MSW, Vitest, Playwright
2. Create `.spec/` state system
3. Generate TypeScript types from Prisma / backend contracts
4. Set up typed API client with Zod validation
5. Create QueryProvider wrapper

### Phase 2: Feature Migration (Weeks 2-6)
Per feature (priority order):
1. **Tasks/Kanban** (core product)
2. **Projects** 
3. **Work Sessions / Laboratory**
4. **Rewards/Store**
5. **Reports**
6. **Admin**
7. **Profile/Leaderboard**

Each feature:
- Create feature folder with types, api, hooks, components
- Write specification (`.spec/specs/`)
- Write tests (unit + component + integration)
- Implement feature components
- Browser validation (Playwright)
- Visual review
- Migrate route in `app/(dashboard)/`
- Remove legacy context + components

### Phase 3: Cleanup (Week 7)
- Remove all legacy contexts
- Remove `contexts/api-client.ts`
- Remove unused UI components
- Final audit

## Technical Decisions (ADRs Needed)

| Decision | Options | Recommendation |
|----------|---------|----------------|
| State Management | TanStack Query vs SWR vs Redux Toolkit Query | **TanStack Query** (best caching, invalidation, optimistic updates, SSR support) |
| URL State | nuqs vs next-intl vs raw searchParams | **nuqs** (type-safe, SSR-compatible, built for Next.js) |
| Forms | react-hook-form + zod vs formik + yup | **react-hook-form + zod** (already used, performant) |
| Component Library | shadcn/ui (Radix) vs Base UI vs custom | **shadcn/ui** (already in use, accessible, customizable) |
| Testing | Vitest + React Testing Library + Playwright | **Vitest + RTL + Playwright** (modern, fast, browser validation) |
| API Mocking | MSW vs mock-fetch vs nock | **MSW** (works in Node + browser, contract validation) |
| Type Generation | Manual vs zod-to-ts vs openapi-typescript | **Manual Zod schemas mirroring backend contracts** (backend has no OpenAPI) |
| Styling | Tailwind v3 -> v4 migration | **Migrate to v4 `@theme`** (semantic tokens, smaller CSS) |
