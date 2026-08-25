"use client"

/**
 * Task hooks (E2/T2.3) — the ONLY sanctioned data path for the board.
 * Server state via TanStack Query over typed endpoints. Optimistic moves use snapshot
 * rollback (legacy parity kanban-board.tsx:210–217) via standardized onMutate/onError.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { tasksApi } from "@/lib/api/endpoints/tasks"
import { queryKeys } from "@/lib/query/keys"
import type { TaskFilters } from "@/lib/api/endpoints/tasks"
import type { Task } from "@/entities/task"

export function useTasks(filters: TaskFilters = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.list(filters),
    queryFn: () => tasksApi.list(filters),
    staleTime: 30_000,
  })
}

/** Cross-cutting invalidation for ANY task mutation (spec §5.3). */
export function useInvalidateTaskGraph() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
    // points/completedTasks change on completion+approval; leaderboard reads users
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
    // server publishes TASK_* notifications on review/approve/reject
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
  }
}

interface RollbackContext {
  applyOptimistic: (updater: (prev: Task[]) => Task[]) => void
  rollback: () => void
  invalidate: () => void
}

function useRollback(): () => RollbackContext {
  const queryClient = useQueryClient()
  const invalidateAll = useInvalidateTaskGraph()

  return () => {
    const snapshot = queryClient.getQueryData<Task[]>(queryKeys.tasks.list({}))
    return {
      applyOptimistic: (updater) => {
        queryClient.setQueryData<Task[]>(queryKeys.tasks.list({}), (prev) =>
          prev ? updater(prev) : prev,
        )
      },
      rollback: () => {
        if (snapshot) queryClient.setQueryData(queryKeys.tasks.list({}), snapshot)
      },
      invalidate: invalidateAll,
    }
  }
}

export function useTaskMutations() {
  const makeRollback = useRollback()

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Task["status"] }) =>
      tasksApi.update(id, { status }),
    onMutate: ({ id, status }) => {
      const ctx = makeRollback()
      ctx.applyOptimistic((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status,
                completed: status === "done",
                completedAt: status === "done" ? new Date().toISOString() : null,
              }
            : t,
        ),
      )
      return { ctx }
    },
    onError: (_err, _vars, context) => context?.ctx.rollback(),
    onSettled: (_d, _e, _v, context) => context?.ctx.invalidate(),
  })

  const complete = useMutation({
    mutationFn: ({ id, userId }: { id: number; userId?: number }) => tasksApi.complete(id, userId),
    onMutate: ({ id }) => {
      const ctx = makeRollback()
      ctx.applyOptimistic((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                // server decides done vs in-review (gateway :401); optimistic shows review
                // for delegated and done for public/global — callers refine via optimisticStatusFor
                status: t.isGlobal || t.taskVisibility === "public" ? "done" : "in-review",
                completed: true,
              }
            : t,
        ),
      )
      return { ctx }
    },
    onError: (_err, _vars, context) => context?.ctx.rollback(),
    onSettled: (_d, _e, _v, context) => context?.ctx.invalidate(),
  })

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => tasksApi.create(body),
    onSettled: () => makeRollback().invalidate(),
  })

  const createBacklog = useMutation({
    mutationFn: (tasks: Array<Record<string, unknown>>) => tasksApi.createBacklog(tasks),
    onSettled: () => makeRollback().invalidate(),
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      tasksApi.update(id, data),
    onSettled: () => makeRollback().invalidate(),
  })

  const approve = useMutation({
    mutationFn: (id: number) => tasksApi.approve(id),
    onSettled: () => makeRollback().invalidate(),
  })

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => tasksApi.reject(id, reason),
    onSettled: () => makeRollback().invalidate(),
  })

  const remove = useMutation({
    mutationFn: (id: number) => tasksApi.remove(id),
    onMutate: (id) => {
      const ctx = makeRollback()
      ctx.applyOptimistic((prev) => prev.filter((t) => t.id !== id))
      return { ctx }
    },
    onError: (_err, _vars, context) => context?.ctx.rollback(),
    onSettled: (_d, _e, _v, context) => context?.ctx.invalidate(),
  })

  return { updateStatus, complete, create, createBacklog, update, approve, reject, remove }
}
