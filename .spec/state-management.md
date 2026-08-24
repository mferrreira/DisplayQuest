# DisplayQuest State Management Strategy

## State Classification

| Category | Examples | Solution | Rationale |
|----------|----------|----------|-----------|
| **Server State** | Tasks, Projects, Users, WorkSessions, Rewards, Reports, Badges, Notifications, LabSchedules, Issues | **TanStack Query v5** | Caching, deduplication, stale-while-revalidate, optimistic updates, invalidation, SSR support, devtools |
| **Client Ephemeral** | Dialog open/closed, form input, sidebar collapse, tooltip visibility, dropdown menus | **Local `useState` / `useReducer`** | Simple, no persistence needed, component-scoped |
| **Cross-Feature Client** | Active work session (floating timer), user preferences (density, compact mode), onboarding state | **Zustand** | Single store, minimal boilerplate, selector-based subscriptions, devtools |
| **URL State** | Filters, pagination, sorting, selected tabs, search query, date ranges | **nuqs** | Shareable/bookmarkable URLs, SSR-compatible, type-safe parsers |
| **Auth State** | Session, user, roles, permissions | **NextAuth SessionProvider + AuthContext** | Built-in session management, server/client sync |
| **Theme State** | Dark/light mode | **next-themes ThemeProvider** | SSR-safe, no flash, system preference detection |

---

## TanStack Query Architecture

### QueryClient Setup
```typescript
// lib/query/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,      // 5 minutes
        gcTime: 1000 * 60 * 30,        // 30 minutes (formerly cacheTime)
        refetchOnWindowFocus: false,
        refetchOnReconnect: 'always',
        retry: (failureCount, error) => {
          if (error instanceof Response && error.status === 401) return false;
          return failureCount < 3;
        },
        throwOnError: false,
      },
      mutations: {
        retry: 0,
        throwOnError: false,
      },
    },
  });
}
```

### Query Key Factory (Type-Safe)
```typescript
// lib/query/keys.ts
export const queryKeys = {
  // Tasks
  tasks: {
    all: ['tasks'] as const,
    lists: () => [...queryKeys.tasks.all, 'list'] as const,
    list: (filters: TaskFilters) => [...queryKeys.tasks.lists(), filters] as const,
    details: () => [...queryKeys.tasks.all, 'detail'] as const,
    detail: (id: number) => [...queryKeys.tasks.details(), id] as const,
    progress: (userId: number) => [...queryKeys.tasks.all, 'progress', userId] as const,
  },
  
  // Projects
  projects: {
    all: ['projects'] as const,
    lists: () => [...queryKeys.projects.all, 'list'] as const,
    list: (filters: ProjectFilters) => [...queryKeys.projects.lists(), filters] as const,
    details: () => [...queryKeys.projects.all, 'detail'] as const,
    detail: (id: number) => [...queryKeys.projects.details(), id] as const,
    members: (projectId: number) => [...queryKeys.projects.detail(projectId), 'members'] as const,
    hours: (projectId: number, week: WeekRange) => [...queryKeys.projects.detail(projectId), 'hours', week] as const,
    volunteers: (projectId: number) => [...queryKeys.projects.detail(projectId), 'volunteers'] as const,
  },
  
  // Users
  users: {
    all: ['users'] as const,
    lists: () => [...queryKeys.users.all, 'list'] as const,
    list: (params: UserListParams) => [...queryKeys.users.lists(), params] as const,
    detail: (id: number) => [...queryKeys.users.all, 'detail', id] as const,
    profile: (id: number) => [...queryKeys.users.detail(id), 'profile'] as const,
    leaderboard: (type: 'points' | 'tasks', limit: number) => [...queryKeys.users.all, 'leaderboard', type, limit] as const,
    statistics: (type: string) => [...queryKeys.users.all, 'statistics', type] as const,
    pending: () => [...queryKeys.users.all, 'pending'] as const,
  },
  
  // Work Sessions
  workSessions: {
    all: ['workSessions'] as const,
    lists: () => [...queryKeys.workSessions.all, 'list'] as const,
    list: (params: WorkSessionListParams) => [...queryKeys.workSessions.lists(), params] as const,
    detail: (id: number) => [...queryKeys.workSessions.all, 'detail', id] as const,
    active: (userId: number) => [...queryKeys.workSessions.all, 'active', userId] as const,
    weeklyHours: (userId: number, week: WeekRange) => [...queryKeys.workSessions.all, 'weeklyHours', userId, week] as const,
  },
  
  // Rewards/Store
  rewards: {
    all: ['rewards'] as const,
    lists: () => [...queryKeys.rewards.all, 'list'] as const,
    list: (params: RewardListParams) => [...queryKeys.rewards.lists(), params] as const,
    detail: (id: number) => [...queryKeys.rewards.all, 'detail', id] as const,
  },
  
  purchases: {
    all: ['purchases'] as const,
    lists: () => [...queryKeys.purchases.all, 'list'] as const,
    list: (params: PurchaseListParams) => [...queryKeys.purchases.lists(), params] as const,
    pending: () => [...queryKeys.purchases.all, 'pending'] as const,
  },
  
  // Laboratory
  lab: {
    responsibilities: {
      all: ['lab', 'responsibilities'] as const,
      list: (params: ResponsibilityListParams) => [...queryKeys.lab.responsibilities.all, 'list', params] as const,
      active: () => [...queryKeys.lab.responsibilities.all, 'active'] as const,
    },
    schedules: {
      all: ['lab', 'schedules'] as const,
      list: () => [...queryKeys.lab.schedules.all, 'list'] as const,
    },
    events: {
      all: ['lab', 'events'] as const,
      list: (date: Date) => [...queryKeys.lab.events.all, 'list', date.toISOString().split('T')[0]] as const,
    },
    notices: {
      all: ['lab', 'notices'] as const,
      list: () => [...queryKeys.lab.notices.all, 'list'] as const,
    },
  },
  
  // Issues
  issues: {
    all: ['issues'] as const,
    lists: () => [...queryKeys.issues.all, 'list'] as const,
    list: (params: IssueListParams) => [...queryKeys.issues.lists(), params] as const,
    detail: (id: number) => [...queryKeys.issues.all, 'detail', id] as const,
  },
  
  // Reports
  reports: {
    weekly: {
      all: ['reports', 'weekly'] as const,
      list: (params: WeeklyReportListParams) => [...queryKeys.reports.weekly.all, 'list', params] as const,
      detail: (id: number) => [...queryKeys.reports.weekly.all, 'detail', id] as const,
    },
    projects: {
      all: ['reports', 'projects'] as const,
      list: (params: ProjectReportListParams) => [...queryKeys.reports.projects.all, 'list', params] as const,
      detail: (id: number) => [...queryKeys.reports.projects.all, 'detail', id] as const,
    },
  },
  
  // Badges/Gamification
  badges: {
    all: ['badges'] as const,
    lists: () => [...queryKeys.badges.all, 'list'] as const,
    list: () => [...queryKeys.badges.lists()] as const,
    detail: (id: number) => [...queryKeys.badges.all, 'detail', id] as const,
    userBadges: (userId: number, limit?: number) => [...queryKeys.badges.all, 'user', userId, limit] as const,
  },
  
  // Notifications
  notifications: {
    all: ['notifications'] as const,
    list: (params: NotificationListParams) => [...queryKeys.notifications.all, 'list', params] as const,
    unreadCount: () => [...queryKeys.notifications.all, 'unreadCount'] as const,
  },
} as const;
```

### Feature Hooks Pattern
```typescript
// features/tasks/hooks/useTasks.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { tasksApi } from '@/features/tasks/api';

export function useTasks(filters: TaskFilters = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.list(filters),
    queryFn: () => tasksApi.list(filters),
    placeholderData: (previous) => previous, // keep previous data while refetching
  });
}

export function useTask(id: number) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id),
    queryFn: () => tasksApi.getById(id),
    enabled: id > 0,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: tasksApi.create,
    onMutate: async (newTask) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.lists() });
      
      // Snapshot previous value
      const previousTasks = queryClient.getQueryData(queryKeys.tasks.lists());
      
      // Optimistically update
      queryClient.setQueryData(queryKeys.tasks.lists(), (old: Task[] | undefined) => [
        { ...newTask, id: Date.now(), status: 'to-do' as const },
        ...(old || []),
      ]);
      
      return { previousTasks };
    },
    onError: (err, newTask, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(queryKeys.tasks.lists(), context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Task> }) => tasksApi.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.lists() });
      
      const previousDetail = queryClient.getQueryData(queryKeys.tasks.detail(id));
      const previousLists = queryClient.getQueryData(queryKeys.tasks.lists());
      
      queryClient.setQueryData(queryKeys.tasks.detail(id), (old: Task | undefined) => 
        old ? { ...old, ...data } : old
      );
      
      queryClient.setQueryData(queryKeys.tasks.lists(), (old: Task[] | undefined) =>
        old?.map(task => task.id === id ? { ...task, ...data } : task)
      );
      
      return { previousDetail, previousLists };
    },
    onError: (err, vars, context) => {
      if (context?.previousDetail) queryClient.setQueryData(queryKeys.tasks.detail(vars.id), context.previousDetail);
      if (context?.previousLists) queryClient.setQueryData(queryKeys.tasks.lists(), context.previousLists);
    },
    onSettled: (data, err, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(vars.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, userId }: { id: number; userId?: number }) => tasksApi.complete(id, userId),
    onMutate: async ({ id, userId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.lists() });
      await queryClient.cancelQueries({ queryKey: queryKeys.users.detail(userId || 0) });
      
      const previousTaskDetail = queryClient.getQueryData(queryKeys.tasks.detail(id));
      const previousTaskLists = queryClient.getQueryData(queryKeys.tasks.lists());
      const previousUser = userId ? queryClient.getQueryData(queryKeys.users.detail(userId)) : undefined;
      
      // Optimistic update depends on task visibility
      queryClient.setQueryData(queryKeys.tasks.detail(id), (old: Task | undefined) =>
        old ? { ...old, status: 'done', completed: true, completedAt: new Date().toISOString() } : old
      );
      
      return { previousTaskDetail, previousTaskLists, previousUser };
    },
    onError: (err, vars, context) => {
      if (context?.previousTaskDetail) queryClient.setQueryData(queryKeys.tasks.detail(vars.id), context.previousTaskDetail);
      if (context?.previousTaskLists) queryClient.setQueryData(queryKeys.tasks.lists(), context.previousTaskLists);
      if (context?.previousUser && vars.userId) queryClient.setQueryData(queryKeys.users.detail(vars.userId), context.previousUser);
    },
    onSettled: (data, err, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(vars.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() });
      if (vars.userId) queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(vars.userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.weekly.all }); // reports may change
    },
  });
}
```

---

## Zustand Store (Cross-Feature Client State)

```typescript
// shared/stores/ui-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  // Global UI preferences
  density: 'comfortable' | 'compact';
  sidebarCollapsed: boolean;
  
  // Active work session (for floating timer)
  activeSessionId: number | null;
  
  // Onboarding
  hasSeenOnboarding: boolean;
  
  // Actions
  setDensity: (density: 'comfortable' | 'compact') => void;
  toggleSidebar: () => void;
  setActiveSession: (id: number | null) => void;
  markOnboardingSeen: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      density: 'comfortable',
      sidebarCollapsed: false,
      activeSessionId: null,
      hasSeenOnboarding: false,
      
      setDensity: (density) => set({ density }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setActiveSession: (activeSessionId) => set({ activeSessionId }),
      markOnboardingSeen: () => set({ hasSeenOnboarding: true }),
    }),
    {
      name: 'displayquest-ui',
      partialize: (state) => ({
        density: state.density,
        sidebarCollapsed: state.sidebarCollapsed,
        hasSeenOnboarding: state.hasSeenOnboarding,
      }),
    }
  )
);
```

---

## nuqs URL State (Shareable UI State)

```typescript
// features/tasks/hooks/useTaskFilters.ts
import { useQueryState, parseAsString, parseAsInteger, parseAsArrayOf } from 'nuqs';

export function useTaskFilters() {
  const [projectId, setProjectId] = useQueryState(
    'projectId',
    parseAsInteger.withDefault(undefined)
  );
  
  const [status, setStatus] = useQueryState(
    'status',
    parseAsString.withDefault('all')
  );
  
  const [assigneeId, setAssigneeId] = useQueryState(
    'assigneeId',
    parseAsInteger.withDefault(undefined)
  );
  
  const [search, setSearch] = useQueryState(
    'search',
    parseAsString.withDefault('')
  );
  
  const [overdueOnly, setOverdueOnly] = useQueryState(
    'overdue',
    parseAsString.withDefault('false')
  );
  
  const [page, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1)
  );
  
  const [sort, setSort] = useQueryState(
    'sort',
    parseAsString.withDefault('createdAt:desc')
  );
  
  const filters = {
    projectId,
    status: status === 'all' ? undefined : status,
    assigneeId,
    search: search || undefined,
    overdueOnly: overdueOnly === 'true',
    page,
    sort,
  };
  
  const setFilters = (newFilters: Partial<typeof filters>) => {
    if (newFilters.projectId !== undefined) setProjectId(newFilters.projectId || null);
    if (newFilters.status !== undefined) setStatus(newFilters.status || 'all');
    if (newFilters.assigneeId !== undefined) setAssigneeId(newFilters.assigneeId || null);
    if (newFilters.search !== undefined) setSearch(newFilters.search || '');
    if (newFilters.overdueOnly !== undefined) setOverdueOnly(newFilters.overdueOnly.toString());
    if (newFilters.page !== undefined) setPage(newFilters.page);
    if (newFilters.sort !== undefined) setSort(newFilters.sort);
  };
  
  const clearFilters = () => {
    setProjectId(null);
    setStatus('all');
    setAssigneeId(null);
    setSearch('');
    setOverdueOnly('false');
    setPage(1);
  };
  
  return { filters, setFilters, clearFilters };
}
```

---

## Server Components + Client Islands Pattern

```typescript
// app/(dashboard)/dashboard/page.tsx (Server Component)
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { KanbanBoardClient } from '@/features/tasks/components/KanbanBoardClient';
import { prefetchTasks } from '@/features/tasks/api/prefetch';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  
  // Prefetch for immediate hydration
  await prefetchTasks(session?.user?.id);
  
  return (
    <div className="container mx-auto p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-6">Painel de Tarefas</h1>
      <KanbanBoardClient initialFilters={{ userId: session?.user?.id }} />
    </div>
  );
}

// features/tasks/components/KanbanBoardClient.tsx ('use client')
import { useTaskFilters } from '@/features/tasks/hooks/useTaskFilters';
import { useTasks, useCreateTask, useUpdateTask, useCompleteTask } from '@/features/tasks/hooks/useTasks';
import { KanbanBoardUI } from '@/features/tasks/components/KanbanBoardUI';
import { TaskDialog } from '@/features/tasks/components/TaskDialog';

export function KanbanBoardClient({ initialFilters }: { initialFilters?: TaskFilters }) {
  const { filters, setFilters, clearFilters } = useTaskFilters();
  const { data: tasks, isLoading, error } = useTasks({ ...initialFilters, ...filters });
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  
  return (
    <KanbanBoardUI
      tasks={tasks || []}
      isLoading={isLoading}
      error={error}
      filters={filters}
      onFiltersChange={setFilters}
      onClearFilters={clearFilters}
      onCreateTask={createTask.mutateAsync}
      onUpdateTask={updateTask.mutateAsync}
      onCompleteTask={completeTask.mutateAsync}
    />
  );
}
```

---

## Invalidation Strategy

### Automatic Invalidation (via Query Keys)
```typescript
// When task is created/updated/completed
queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() });
queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(id) });

// When project is updated
queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(id) });
queryClient.invalidateQueries({ queryKey: queryKeys.projects.members(id) });

// When user points change (task completion, purchase approval)
queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
queryClient.invalidateQueries({ queryKey: queryKeys.users.leaderboard('points', 10) });

// When work session created/ended
queryClient.invalidateQueries({ queryKey: queryKeys.workSessions.lists() });
queryClient.invalidateQueries({ queryKey: queryKeys.workSessions.active(userId) });
queryClient.invalidateQueries({ queryKey: queryKeys.reports.weekly.all });

// When purchase approved/denied
queryClient.invalidateQueries({ queryKey: queryKeys.purchases.lists() });
queryClient.invalidateQueries({ queryKey: queryKeys.purchases.pending() });
queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
queryClient.invalidateQueries({ queryKey: queryKeys.rewards.lists() });
```

### Targeted Invalidation (Fine-Grained)
```typescript
// Update single task in all lists without refetch
queryClient.setQueryData(queryKeys.tasks.lists(), (old: Task[] | undefined) =>
  old?.map(task => task.id === updatedTask.id ? updatedTask : task)
);

// Update user points optimistically
queryClient.setQueryData(queryKeys.users.detail(userId), (old: User | undefined) =>
  old ? { ...old, points: old.points + delta } : old
);
```

---

## Migration from Current Contexts

### Phase 1: Add QueryProvider (No Breaking Changes)
```typescript
// app/client-layout.tsx (updated)
import { QueryProvider } from '@/shared/providers/QueryProvider';

export default function ClientLayout({ children, session }) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <QueryProvider>
          {/* Existing providers - keep for now */}
          <UserProvider>
            <ProjectProvider>
              <WorkSessionsProvider>
                {shouldProvideTasks ? <TaskProvider>{children}</TaskProvider> : children}
              </WorkSessionsProvider>
            </ProjectProvider>
          </UserProvider>
        </QueryProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
```

### Phase 2: Feature-by-Feature Migration
1. Create feature hooks using TanStack Query
2. Update components to use new hooks
3. Remove corresponding context provider
4. Run tests + browser validation

### Phase 3: Remove Legacy Contexts
- Delete `contexts/task-context.tsx`, `project-context.tsx`, etc.
- Delete `contexts/api-client.ts`
- Update all imports

---

## Error Handling Strategy

### Global Error Boundary
```typescript
// app/(dashboard)/error.tsx
'use client';

import { useEffect } from 'react';
import { Button } from '@/shared/ui/Button';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);
  
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-xl font-semibold">Algo deu errado</h2>
        <p className="text-muted-foreground max-w-md">
          {error.message || 'Ocorreu um erro inesperado. Tente recarregar a página.'}
        </p>
        <Button onClick={reset} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
```

### Mutation Error Handling
```typescript
// Shared hook for consistent mutation UX
export function useMutationWithToast<TData, TVariables>(
  mutationFn: (vars: TVariables) => Promise<TData>,
  options: {
    successMessage?: string | ((data: TData) => string);
    errorMessage?: string | ((error: Error) => string);
    onSuccess?: (data: TData) => void;
  } = {}
) {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      if (options.successMessage) {
        toast({
          title: typeof options.successMessage === 'function' 
            ? options.successMessage(data) 
            : options.successMessage,
        });
      }
      options.onSuccess?.(data);
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: options.errorMessage 
          ? (typeof options.errorMessage === 'function' ? options.errorMessage(error) : options.errorMessage)
          : error.message,
      });
    },
  });
}
```

---

## Testing Strategy for State

### Unit Tests (Vitest)
- Query key factory: correct key structure
- Mutation onMutate/onError/onSettled logic
- Zustand store actions + persistence
- nuqs parser serialization/deserialization

### Component Tests (React Testing Library)
- Feature hooks with MSW handlers
- Optimistic update UI
- Error state UI
- Loading/skeleton states

### Integration Tests (Vitest + MSW)
- Full query + mutation flow
- Invalidation cascades
- Cross-feature state (e.g., task completion -> user points)

### E2E Tests (Playwright)
- Critical user flows with real backend
- Offline/online transitions
- Multi-tab synchronization
