"use client"

/**
 * TaskBoard (E2/T2.4) — new container replacing contexts/task-context + legacy kanban-board.
 * URL state via nuqs (projeto/atrasadas/busca/visao); server state via features/tasks hooks.
 * Overdue + search filter CLIENT-side (GET /api/tasks ignores those params — system-discovery §5);
 * projectId goes to the server (membership-scoped there).
 */
import { useCallback, useMemo, useState } from "react"
import { DragDropContext, DropResult } from "@hello-pangea/dnd"
import { useQueryState, parseAsBoolean, parseAsInteger, parseAsString } from "nuqs"
import { useSession } from "next-auth/react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/contexts/auth-context"
import { useProjects } from "@/features/projects"
import {
  useTasks,
  useTaskMutations,
  resolveMove,
  isArchivedTask,
  isTaskOverdue,
  BOARD_COLUMNS,
} from "../index"
import { isAssignedToUser } from "../utils/is-assigned-to-user"
import type { Task } from "@/entities/task"
import { BoardColumn } from "./board-column"
import { BoardToolbar } from "./board-toolbar"
import { ArchiveSection } from "./archive-section"
import { TaskDialog } from "./task-dialog"
import { TaskDetailDialog } from "./task-detail-dialog"
import { BacklogDialog } from "./backlog-dialog"

export function TaskBoard() {
  const { data: session } = useSession()
  const { user } = useAuth()
  const { data: projects = [] } = useProjects()
  const { data: tasks, isPending, error, refetch } = useTasks({})
  const { updateStatus, complete } = useTaskMutations()

  // URL state (nuqs) — shareable/back-forward safe (spec AC 8)
  const [projetoParam, setProjetoParam] = useQueryState("projeto", parseAsInteger)
  const [atrasadasParam, setAtrasadasParam] = useQueryState(
    "atrasadas",
    parseAsBoolean.withDefault(false),
  )
  const [buscaParam, setBuscaParam] = useQueryState("busca", parseAsString.withDefault(""))
  const [minhasParam, setMinhasParam] = useQueryState(
    "minhas",
    parseAsBoolean.withDefault(false),
  )
  const [compactaParam, setCompactaParam] = useQueryState(
    "visao",
    parseAsString.withDefault("normal"),
  )

  const [editTask, setEditTask] = useState<Task | null>(null)
  const [viewTask, setViewTask] = useState<Task | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [backlogOpen, setBacklogOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  const userRoles: string[] = user?.roles ?? []
  const canCreateTasks = ["COORDENADOR", "GERENTE", "GERENTE_PROJETO", "COLABORADOR", "PESQUISADOR"].some((r) =>
    userRoles.includes(r),
  )
  const canSeeProjectSelector = ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"].some((r) =>
    userRoles.includes(r),
  )
  const isLeader = ["COORDENADOR", "GERENTE", "GERENTE_PROJETO", "LABORATORISTA"].some((r) =>
    userRoles.includes(r),
  )

  const sessionUserId = (session?.user as { id?: number } | undefined)?.id

  const filteredTasks = useMemo(() => {
    let list = tasks ?? []
    if (minhasParam) list = list.filter((t) => isAssignedToUser(t, sessionUserId))
    if (atrasadasParam) list = list.filter((t) => isTaskOverdue(t))
    if (buscaParam) {
      const q = buscaParam.toLowerCase()
      list = list.filter((t) => t.title.toLowerCase().includes(q))
    }
    return list
  }, [tasks, minhasParam, atrasadasParam, buscaParam, sessionUserId])

  const archivedTasks = useMemo(() => filteredTasks.filter((t) => isArchivedTask(t)), [filteredTasks])
  const boardTasks = useMemo(() => {
    const archivedIds = new Set(archivedTasks.map((t) => t.id))
    return filteredTasks.filter((t) => !archivedIds.has(t.id))
  }, [filteredTasks, archivedTasks])

  const overdueCount = useMemo(() => (tasks ?? []).filter((t) => isTaskOverdue(t)).length, [tasks])

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source, draggableId } = result
      if (!destination) return
      if (destination.droppableId === source.droppableId && destination.index === source.index) return

      const task = (tasks ?? []).find((t) => t.id.toString() === draggableId)
      if (!task) return

      const target = destination.droppableId as Task["status"]
      const decision = resolveMove({ task, target, isLeader })

      if (decision.kind === "blocked") {
        toast.error("Ação não permitida", {
          description: "Apenas líderes de projeto podem mover tarefas concluídas.",
        })
        return
      }
      if (decision.kind === "remap-to-review") {
        toast.info("📋 Tarefa Enviada para Revisão", {
          description: "Os pontos serão adicionados após aprovação.",
        })
        updateStatus.mutate({ id: task.id, status: "in-review" })
        return
      }
      if (decision.kind === "complete") {
        const isDirectDone = task.isGlobal || task.taskVisibility === "public"
        toast[isDirectDone ? "success" : "info"](
          isDirectDone ? "🎉 Tarefa Concluída!" : "📋 Tarefa Enviada para Revisão",
        )
        complete.mutate({ id: task.id, userId: (session?.user as { id?: number } | undefined)?.id })
        return
      }
      updateStatus.mutate({ id: task.id, status: decision.status })
    },
    [tasks, isLeader, updateStatus, complete, session],
  )

  const openCreate = useCallback(() => {
    setEditTask(null)
    setDialogOpen(true)
  }, [])

  const openEdit = useCallback((task: Task) => {
    setEditTask(task)
    setDialogOpen(true)
    setDetailOpen(false)
  }, [])

  const openDetail = useCallback((task: Task) => {
    setViewTask(task)
    setDetailOpen(true)
  }, [])

  if (isPending) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Carregando tarefas">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-5 gap-3 overflow-x-auto">
          {BOARD_COLUMNS.map((column) => (
            <div key={column.id} className="space-y-3">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>Erro ao carregar tarefas. Tente novamente.</span>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const isEmptyTotal = (tasks ?? []).length === 0
  const isEmptyFiltered = !isEmptyTotal && boardTasks.length === 0 && archivedTasks.length === 0

  return (
    <div className="space-y-6">
      <BoardToolbar
        filters={{
          projectId: projetoParam ?? undefined,
          overdue: atrasadasParam || undefined,
          search: buscaParam || undefined,
          mine: minhasParam || undefined,
        }}
        onFiltersChange={(next) => {
          void setProjetoParam(next.projectId ?? null)
          void setAtrasadasParam(Boolean(next.overdue))
          void setBuscaParam(next.search ?? "")
          void setMinhasParam(Boolean(next.mine))
        }}
        overdueCount={overdueCount}
        canCreateTasks={canCreateTasks}
        canSeeProjectSelector={canSeeProjectSelector}
        projects={projects}
        isCompact={compactaParam === "compacta"}
        onToggleCompact={() => void setCompactaParam(compactaParam === "compacta" ? "normal" : "compacta")}
        onCreateTask={openCreate}
        onCreateBacklog={() => setBacklogOpen(true)}
        isUpdating={updateStatus.isPending || complete.isPending}
      />

      {isEmptyTotal ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <p className="text-sm font-medium">Nenhuma tarefa por aqui</p>
          <p className="text-sm text-muted-foreground">
            {canCreateTasks
              ? "Crie a primeira tarefa para começar."
              : "Ainda não há tarefas disponíveis para você."}
          </p>
          {canCreateTasks && <Button onClick={openCreate}>Nova Tarefa</Button>}
        </div>
      ) : isEmptyFiltered ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <p className="text-sm font-medium">Nenhuma tarefa corresponde aos filtros</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void setProjetoParam(null)
              void setAtrasadasParam(false)
              void setBuscaParam("")
            }}
          >
            Limpar filtros
          </Button>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto pb-2">
            <div
              className="grid min-w-[1180px] grid-cols-5 gap-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
            >
              {BOARD_COLUMNS.map((column) => (
                <BoardColumn
                  key={column.id}
                  status={column.id}
                  tasks={boardTasks.filter((task) => task.status === column.id)}
                  canAddTask={canCreateTasks}
                  isCompact={compactaParam === "compacta"}
                  onAddTask={openCreate}
                  onEdit={openEdit}
                  onOpenDetail={openDetail}
                />
              ))}
            </div>
          </div>
        </DragDropContext>
      )}

      <ArchiveSection tasks={archivedTasks} projects={projects} />

      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} task={editTask} />
      <BacklogDialog open={backlogOpen} onOpenChange={setBacklogOpen} defaultProjectId={projetoParam} />
      <TaskDetailDialog
        task={viewTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={openEdit}
      />

      {/* screen-reader live region for mutation feedback */}
      <span className="sr-only" role="status" aria-live="polite">
        {updateStatus.isPending || complete.isPending ? "Atualizando tarefa..." : ""}
      </span>
    </div>
  )
}
