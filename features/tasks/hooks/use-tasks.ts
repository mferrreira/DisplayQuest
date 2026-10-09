"use client"

/**
 * Task hooks (E2/T2.3) — the ONLY sanctioned data path for the board.
 * Server state via TanStack Query over typed endpoints. Optimistic moves use snapshot
 * rollback (legacy parity kanban-board.tsx:210–217) via standardized onMutate/onError.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { tasksApi, type AwardedTaskResponse, type SubtaskMutationResponse } from "@/lib/api/endpoints/tasks"
import { announcePointsDelta } from "@/lib/points-delta"
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
  return (scope?: "tasks" | "notifications" | "full") => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
    // server publishes TASK_* notifications on in-review transitions and reject
    if (scope === "notifications" || scope === "full") {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    }
    if (scope === "full") {
      // points/completedTasks change on completion+approval; leaderboard reads users
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
    }
  }
}

interface RollbackContext {
  applyOptimistic: (updater: (prev: Task[]) => Task[]) => void
  rollback: () => void
  invalidate: (scope?: "tasks" | "notifications" | "full") => void
}

function useRollback(): () => RollbackContext {
  const queryClient = useQueryClient()
  const invalidateAll = useInvalidateTaskGraph()

  // Ajuste pós-encerramento item 1 (2026-10-07): as listas de tarefa têm mais de uma variante
  // (filtros diferentes = chaves diferentes). Escrever/snapshotar SÓ `list({})` deixava o quadro
  // com projeto selecionado sem atualizar. `lists()` é o prefixo comum de todas elas.
  return () => {
    const snapshot = queryClient.getQueriesData<Task[]>({ queryKey: queryKeys.tasks.lists() })
    return {
      applyOptimistic: (updater) => {
        queryClient.setQueriesData<Task[]>({ queryKey: queryKeys.tasks.lists() }, (prev) =>
          prev ? updater(prev) : prev,
        )
      },
      rollback: () => {
        for (const [key, data] of snapshot) {
          if (data) queryClient.setQueryData(key, data)
        }
      },
      invalidate: invalidateAll,
    }
  }
}

export function useTaskMutations() {
  const makeRollback = useRollback()
  // complete/approve change the ACTOR's points when they are the assignee. The header badge
  // reads from the next-auth session (T1.4: no all-users fetch); its session callback re-reads
  // points from the DB on every fetch (lib/auth/config.ts session callback), so refreshing the
  // session after awarding mutations keeps the badge live without a page reload.
  const { update: refreshSession, data: session } = useSession()
  const refreshPoints = () => {
    // optional call: test stubs may omit update(); failures are best-effort by design
    const result = typeof refreshSession === "function" ? refreshSession() : undefined
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        /* unauthenticated/no-op contexts must not break the mutation */
      })
    }
  }

  // plan-v3 OND4-B: o contador do cabeçalho já recebia o total novo, mas pulava do antigo para o
  // novo sem dizer quanto nem para que lado. O sinal do chip (OND4-A, DEC-48) é do servidor.
  // Só o prêmio da PRÓPRIA pessoa move o contador dela: a aprovação credita o responsável pela
  // tarefa, quase nunca quem aprovou, e sem esta comparação o chip mostraria o prêmio de outra
  // pessoa. `null` (ninguém creditado) e `0` (o award já existia) não são delta.
  const sessionUserId = (session?.user as { id?: number } | undefined)?.id
  const announceMyAward = (result: AwardedTaskResponse) => {
    if (sessionUserId == null) return
    if (result.awardedTo !== sessionUserId) return
    announcePointsDelta(result.awardedPoints)
  }

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
    // moving to in-review publishes TASK_REVIEW_REQUEST → refresh notifications
    onSettled: (_d, _e, _v, context) => context?.ctx.invalidate("notifications"),
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
    onSuccess: (result) => announceMyAward(result),
    onSettled: (_d, _e, _v, context) => {
      context?.ctx.invalidate("full")
      refreshPoints()
    },
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
    // generic update can move a task to in-review → TASK_REVIEW_REQUEST published
    onSettled: () => makeRollback().invalidate("notifications"),
  })

  const approve = useMutation({
    mutationFn: (id: number) => tasksApi.approve(id),
    onSuccess: (result) => announceMyAward(result),
    onSettled: () => {
      makeRollback().invalidate("full")
      // delegated tasks award points to the assignee HERE (gateway :458–481)
      refreshPoints()
    },
  })

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => tasksApi.reject(id, reason),
    // reject publishes TASK_REJECTED → refresh notifications
    onSettled: () => makeRollback().invalidate("notifications"),
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

  /**
   * plan-v4 · V4-5 — as três operações de subtask do cliente.
   *
   * O que é diferente das mutações de tarefa: a resposta carrega a MÃE (DEC-79), e é ela que o
   * cliente aplica. Mexer numa subtask muda três coisas na mãe — a lista, a base do prêmio
   * (10 + 5·n) e, às vezes, o STATUS (DEC-81: a última subtask concluída move a mãe para
   * "Em Revisão"). Otimista só na lista; o status vem do servidor, porque é o servidor que decide
   * se houve auto-move. Sem isso o cartão mostraria a mãe na coluna errada até o próximo refresh.
   */
  const queryClient = useQueryClient()
  // Item 1: escrever em TODAS as variantes de lista (prefixo `lists()`), senão o diálogo/quadro
  // filtrado fica com o snapshot antigo enquanto `list({})` já foi atualizado.
  const applyMother = (result: SubtaskMutationResponse) => {
    queryClient.setQueriesData<Task[]>({ queryKey: queryKeys.tasks.lists() }, (prev) =>
      prev ? prev.map((t) => (t.id === result.task.id ? { ...t, ...result.task } : t)) : prev,
    )
  }
  const patchSubtaskInCache = (
    taskId: number,
    subtaskId: number,
    patch: { title?: string; completed?: boolean },
  ) => {
    queryClient.setQueriesData<Task[]>({ queryKey: queryKeys.tasks.lists() }, (prev) =>
      prev
        ? prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  subtasks: (t.subtasks ?? []).map((s) =>
                    s.id === subtaskId ? { ...s, ...patch } : s,
                  ),
                }
              : t,
          )
        : prev,
    )
  }

  const createSubtask = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) => tasksApi.createSubtask(id, title),
    onSuccess: applyMother,
    onSettled: () => makeRollback().invalidate(),
  })

  const updateSubtask = useMutation({
    mutationFn: ({
      id,
      subtaskId,
      data,
    }: {
      id: number
      subtaskId: number
      data: { title?: string; completed?: boolean }
    }) => tasksApi.updateSubtask(id, subtaskId, data),
    onMutate: ({ id, subtaskId, data }) => {
      const ctx = makeRollback()
      patchSubtaskInCache(id, subtaskId, data)
      return { ctx }
    },
    onSuccess: applyMother,
    onError: (_err, _vars, context) => context?.ctx.rollback(),
    // a última subtask concluída publica TASK_REVIEW_REQUEST (DEC-81)
    onSettled: (_d, _e, _v, context) => context?.ctx.invalidate("notifications"),
  })

  const removeSubtask = useMutation({
    mutationFn: ({ id, subtaskId }: { id: number; subtaskId: number }) =>
      tasksApi.removeSubtask(id, subtaskId),
    onMutate: ({ id, subtaskId }) => {
      const ctx = makeRollback()
      queryClient.setQueriesData<Task[]>({ queryKey: queryKeys.tasks.lists() }, (prev) =>
        prev
          ? prev.map((t) =>
              t.id === id ? { ...t, subtasks: (t.subtasks ?? []).filter((s) => s.id !== subtaskId) } : t,
            )
          : prev,
      )
      return { ctx }
    },
    onSuccess: applyMother,
    onError: (_err, _vars, context) => context?.ctx.rollback(),
    onSettled: (_d, _e, _v, context) => context?.ctx.invalidate(),
  })

  return {
    updateStatus,
    complete,
    create,
    createBacklog,
    update,
    approve,
    reject,
    remove,
    createSubtask,
    updateSubtask,
    removeSubtask,
  }
}
