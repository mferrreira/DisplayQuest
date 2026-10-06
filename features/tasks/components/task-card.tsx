"use client"

/**
 * TaskCard (E2/T2.4+T2.5) — replaces components/ui/kanban-card.tsx.
 * Visual parity with legacy gradients/badges; fixes D-15 findings:
 *  - ALL icon-only controls have aria-label (button-name)
 *  - Progress bar has role/aria (progressbar-name) — via shadcn Progress + wrapper label
 *  - NO nested interactive: DnD handle is a dedicated grip OUTSIDE buttons; card body click opens
 *    details; actions live in the header menu + footer buttons (keyboard reachable)
 *  - Reject uses AlertDialog with reason input (banned prompt() removed — A3)
 */
import { Draggable } from "@hello-pangea/dnd"
import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MoreHorizontal,
  Pencil,
  Calendar,
  User,
  Flag,
  Users,
  Crown,
  Zap,
  Check,
  X,
  GripVertical,
  ArrowRight,
  Eye,
  Lock,
  AlertTriangle,
  CalendarClock,
} from "lucide-react"
import type { Task, TaskStatus, TaskSubtask } from "@/entities/task"
import { useAuth } from "@/contexts/auth-context"
import { useProjects } from "@/features/projects"
import { useUsers } from "@/features/users"
import {
  useTaskMutations,
  resolveMove,
  allowedTargets,
  moveBlockedMessage,
  openSubtasksMessage,
  projectedAward,
  POINTS_PER_TASK,
  BOARD_COLUMNS,
} from ".."
import { toast } from "sonner"
import { formatDateOnly } from "@/lib/date-only"

const STATUS_PROGRESS: Record<Task["status"], number> = {
  "to-do": 0,
  "in-progress": 50,
  "in-review": 75,
  adjust: 90,
  done: 100,
}

const PRIORITY_LABEL: Record<Task["priority"], string> = {
  low: "BAIXA",
  medium: "MÉDIA",
  high: "ALTA",
  urgent: "URGENTE",
}

const STATUS_LABEL: Record<Task["status"], string> = {
  "to-do": "A FAZER",
  "in-progress": "EM ANDAMENTO",
  "in-review": "EM REVISÃO",
  adjust: "AJUSTES",
  done: "CONCLUÍDA",
}

function priorityBadgeClass(priority: Task["priority"]): string {
  switch (priority) {
    case "high":
      return "bg-gradient-to-r from-red-500 to-pink-500 text-white border-red-400 dark:from-red-500/20 dark:to-pink-500/20 dark:text-red-300 dark:border-red-500/40"
    case "urgent":
      return "bg-gradient-to-r from-fuchsia-600 to-red-600 text-white border-fuchsia-400 dark:from-fuchsia-500/20 dark:to-red-500/20 dark:text-fuchsia-300 dark:border-fuchsia-500/40"
    case "medium":
      return "bg-gradient-to-r from-yellow-500 to-orange-500 text-white border-yellow-400 dark:from-yellow-500/20 dark:to-orange-500/20 dark:text-yellow-300 dark:border-yellow-500/40"
    case "low":
      return "bg-gradient-to-r from-green-500 to-emerald-500 text-white border-green-400 dark:from-green-500/20 dark:to-emerald-500/20 dark:text-green-300 dark:border-green-500/40"
  }
}

function statusBadgeClass(status: Task["status"]): string {
  switch (status) {
    case "done":
      return "bg-gradient-to-r from-emerald-500 to-green-500 text-white border-emerald-400 dark:from-emerald-500/20 dark:to-green-500/20 dark:text-emerald-300 dark:border-emerald-500/40"
    case "in-progress":
      return "bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-blue-400 dark:from-blue-500/20 dark:to-cyan-500/20 dark:text-blue-300 dark:border-blue-500/40"
    case "in-review":
      return "bg-gradient-to-r from-purple-500 to-violet-500 text-white border-purple-400 dark:from-purple-500/20 dark:to-violet-500/20 dark:text-purple-300 dark:border-purple-500/40"
    case "adjust":
      return "bg-gradient-to-r from-orange-500 to-amber-500 text-white border-orange-400 dark:from-orange-500/20 dark:to-amber-500/20 dark:text-orange-300 dark:border-orange-500/40"
    default:
      return "bg-gradient-to-r from-slate-500 to-gray-500 text-white border-slate-400 dark:from-slate-500/20 dark:to-gray-500/20 dark:text-slate-300 dark:border-slate-500/40"
  }
}

export interface TaskCardProps {
  task: Task
  index: number
  isOverdue: boolean
  isDueToday?: boolean
  isCompact?: boolean
  onEdit: (task: Task) => void
  onOpenDetail: (task: Task) => void
}

/**
 * Menu de ações do cartão — **um só**, para as duas aparências (normal e compacta).
 *
 * Antes havia duas cópias byte a byte desse menu dentro do cartão, uma por aparência, e
 * só uma delas recebia mudança: foi assim que a lista de destinos do 3.B entrou pela metade
 * (a compacta continuava oferecendo o que a regra bloqueia, sem nenhum teste para avisar).
 * Extrair deixa a decisão em um lugar só; o que continua variando entre as aparências é o
 * tamanho do gatilho.
 */
function TaskCardMenu({
  task,
  isLeader,
  isCompact = false,
  onMove,
  onOpenDetail,
  onEdit,
}: {
  task: Task
  isLeader: boolean
  isCompact?: boolean
  onMove: (target: TaskStatus) => void
  onOpenDetail: (task: Task) => void
  onEdit: (task: Task) => void
}) {
  /**
   * plan-v3 OND3-B: o menu lista o que a regra permite (`allowedTargets`, derivado de
   * `resolveMove`), e não "as colunas menos a atual". Sem destinos — tarefa Concluído vista
   * por quem não é líder — a opção some e fica um item desabilitado dizendo por quê, em vez
   * de quatro destinos que voltariam com o mesmo toast de "Ação não permitida".
   */
  const moveTargets = allowedTargets(task, isLeader)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={
            isCompact ? "h-5 w-5 shrink-0 p-0 opacity-40 hover:opacity-100" : "h-6 w-6 shrink-0 p-0"
          }
          aria-label={`Ações para ${task.title}`}
        >
          <MoreHorizontal className={isCompact ? "h-3 w-3" : "h-4 w-4"} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Mover para</DropdownMenuLabel>
        {moveTargets.length === 0 ? (
          <DropdownMenuItem disabled>
            <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
            Tarefa concluída só volta de coluna para líderes de projeto
          </DropdownMenuItem>
        ) : (
          BOARD_COLUMNS.filter((c) => moveTargets.includes(c.id)).map((column) => (
            <DropdownMenuItem key={column.id} onSelect={() => onMove(column.id)}>
              <ArrowRight className="mr-2 h-4 w-4" aria-hidden="true" />
              {column.title}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onOpenDetail(task)}>
          <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
          Ver detalhes
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEdit(task)}>
          <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
          Editar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TaskCard({ task, index, isOverdue, isDueToday, isCompact, onEdit, onOpenDetail }: TaskCardProps) {
  const { user } = useAuth()
  const { data: projects = [] } = useProjects()
  const { data: users = [] } = useUsers()
  const { approve, reject, updateStatus, complete, updateSubtask } = useTaskMutations()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const isPublicTask = task.taskVisibility === "public"
  const isGlobalTask = task.isGlobal
  // plan-v3 OND1-D (DEC-30): o selo mostra a base da regla, nunca `task.points` — a
  // coluna virou histórico (DEC-40) e o valor creditado depende do prazo (ver task-card.tsx
  // toast e task-detail-dialog.tsx). O antigo `isHighPoints` (>= 50) morreu aqui.
  // plan-v4 · V4-4 (DEC-56): a base é 10 + 10 por subtask. Sem subtask é o texto de sempre.
  const subtaskCount = task.subtasks?.length ?? 0
  const basePoints = POINTS_PER_TASK * (1 + subtaskCount)
  const pointsBadgeTitle =
    subtaskCount > 0
      ? `Tarefa vale ${basePoints} pontos: ${POINTS_PER_TASK} da tarefa e ${POINTS_PER_TASK} por subtask (${subtaskCount}) — bônus de 50% por parcela entregue adiantada, penalidade de ${POINTS_PER_TASK} por dia de atraso de cada parcela`
      : `Tarefa vale ${POINTS_PER_TASK} pontos — bônus de 50% se entregue adiantada, penalidade de ${POINTS_PER_TASK} por dia de atraso`

  const userRoles = user?.roles ?? []
  const isLeader =
    userRoles.includes("COORDENADOR") ||
    userRoles.includes("GERENTE") ||
    userRoles.includes("GERENTE_PROJETO") ||
    userRoles.includes("LABORATORISTA")
  const assigneeIds = (task.assigneeIds?.length ? task.assigneeIds : task.assignedTo ? [task.assignedTo] : []).filter(
    (id): id is number => typeof id === "number",
  )
  const isSelfAssignee = Boolean(user?.id && (task.assignedTo === user.id || assigneeIds.includes(user.id)))
  const canApproveReject =
    task.status === "in-review" &&
    (userRoles.includes("COORDENADOR") ||
      userRoles.includes("GERENTE") ||
      (userRoles.includes("GERENTE_PROJETO") &&
        task.projectId != null &&
        projects.find((p) => p.id === task.projectId)?.leaderId === user?.id &&
        !isSelfAssignee))

  const projectName = task.projectId ? projects.find((p) => p.id === task.projectId)?.name : undefined

  /**
   * plan-v4 · V4-5 (DEC-80, DEC-81) — o cartão não é a lista de subtasks: é o **aviso de trava**.
   * A lista completa, com criar/renomear/apagar, vive no diálogo de detalhe. O que o cartão mostra
   * é o que destrava: as subtasks ainda ABERTAS, cada uma com uma checkbox.
   *
   * `task.status === "done"` não mostra aviso: nada termina com subtask aberta (a trava já
   * garantiu isso na entrada), então aviso em tarefa concluída seria ruído.
   */
  const openSubtasks = (task.subtasks ?? []).filter((s) => !s.completed)
  const completedSubtasks = (task.subtasks ?? []).filter((s) => s.completed)
  const showsSubtaskLock = openSubtasks.length > 0 && task.status !== "done"
  // Frase num nó só: "Atual: {n} pontos" + dica virou três nós e quebrou `getByText` da frase
  // inteira (AGENTS.md, V4-4b). Aqui a contagem é montada antes, como string.
  const openSubtasksLabel =
    openSubtasks.length === 1 ? "1 subtask aberta" : `${openSubtasks.length} subtasks abertas`
  const subtaskProgressLabel = `${completedSubtasks.length}/${task.subtasks?.length ?? 0} concluídas`

  /** T2.5 keyboard alternative: menu lists allowed targets, same rules as drag (OND3-B). */
  const handleMove = (target: TaskStatus) => {
    const decision = resolveMove({ task, target, isLeader })
    if (decision.kind === "blocked") {
      toast.error("Ação não permitida", {
        description: moveBlockedMessage(decision, target),
      })
      return
    }
    if (decision.kind === "remap-to-review") {
      toast.info("📋 Tarefa Enviada para Revisão", {
        description: "A tarefa foi enviada para revisão. Os pontos serão adicionados após aprovação.",
      })
      updateStatus.mutate({ id: task.id, status: "in-review" })
      return
    }
    if (decision.kind === "complete") {
      const isDirectDone = task.isGlobal || task.taskVisibility === "public"
      // plan-v3 OND1-C: o número exibido é o mesmo que o servidor credita, porque agora existe
      // uma aritmética só (points-rules). Antes o toast prometia `task.points`.
      const award = projectedAward(task)
      const awardDescription =
        award > POINTS_PER_TASK
          ? `${award} pts (bônus por entrega adiantada).`
          : award < POINTS_PER_TASK
            ? `${award} pts (penalidade por atraso aplicada).`
            : `${POINTS_PER_TASK} pontos foram adicionados ao perfil do responsável.`
      toast[isDirectDone ? "success" : "info"](
        isDirectDone ? "🎉 Tarefa Concluída!" : "📋 Tarefa Enviada para Revisão",
        {
          description: isDirectDone
            ? awardDescription
            : "A tarefa foi enviada para revisão. Os pontos serão adicionados após aprovação.",
        },
      )
      complete.mutate({ id: task.id, userId: user?.id })
      return
    }
    updateStatus.mutate({ id: task.id, status: decision.status })
  }

  const handleApprove = async () => {
    try {
      await approve.mutateAsync(task.id)
      toast.success("Tarefa aprovada", { description: "A tarefa foi aprovada com sucesso." })
    } catch (error) {
      toast.error("Erro ao aprovar tarefa", {
        description: error instanceof Error ? error.message : "Falha ao aprovar tarefa.",
      })
    }
  }

  /**
   * plan-v4 · V4-5 — concluir subtask direto no cartão (decisão do dono: um clique, sem abrir
   * diálogo). O que faz a mais que um checkbox comum é o auto-move: se esta era a última aberta,
   * a mãe vai sozinha para "Em Revisão" (DEC-81), e a interface DIZ isso — sem a frase, a tarefa
   * muda de coluna diante da pessoa sem explicação.
   */
  const handleCompleteSubtask = async (subtask: TaskSubtask) => {
    try {
      const result = await updateSubtask.mutateAsync({
        id: task.id,
        subtaskId: subtask.id,
        data: { completed: true },
      })
      const autoMoved = task.status === "in-progress" && result.task.status === "in-review"
      if (autoMoved) {
        toast.info("📋 Última subtask concluída — tarefa enviada para revisão", {
          description: "A tarefa foi enviada para revisão. Os pontos serão adicionados após aprovação.",
        })
      }
    } catch (error) {
      toast.error("Não foi possível concluir a subtask", {
        description: error instanceof Error ? error.message : "Falha ao concluir a subtask.",
      })
    }
  }

  const handleRejectConfirm = async () => {
    try {
      await reject.mutateAsync({ id: task.id, reason: rejectReason.trim() || undefined })
      toast.success("Tarefa rejeitada", {
        description: "A tarefa retornou para ajustes.",
      })
      setRejectOpen(false)
      setRejectReason("")
    } catch (error) {
      toast.error("Erro ao rejeitar tarefa", {
        description: error instanceof Error ? error.message : "Falha ao rejeitar tarefa.",
      })
    }
  }

  const cardTone = isPublicTask
    ? isOverdue
      ? "border-red-400 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-500/10 dark:to-red-500/5"
      : isDueToday
        ? "border-sky-300 bg-gradient-to-br from-sky-50 to-sky-100 dark:border-sky-500/40 dark:from-sky-500/10 dark:to-sky-500/5"
        : "border-amber-400 dark:border-amber-500/40 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-400/10 dark:via-yellow-300/5 dark:to-orange-400/10"
    : isOverdue
      ? "border-red-300 bg-gradient-to-br from-red-50 to-red-100 dark:border-red-500/40 dark:from-red-500/10 dark:to-red-500/5"
      : isDueToday
        ? "border-sky-300 bg-gradient-to-br from-sky-50 to-sky-100 dark:border-sky-500/40 dark:from-sky-500/10 dark:to-sky-500/5"
        : "border-gray-200 bg-gradient-to-br from-white to-gray-50 dark:border-gray-600 dark:from-gray-800 dark:to-gray-700"

  return (
    <>
      <Draggable draggableId={task.id.toString()} index={index} isDragDisabled={task.status === "done"}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`mb-3 ${snapshot.isDragging ? "rotate-2 shadow-2xl" : ""}`}
          >
            <Card className={`relative overflow-hidden ${cardTone}`}>
              {isPublicTask && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-200/20 dark:via-yellow-500/10 to-transparent animate-pulse pointer-events-none" />
              )}
              {isGlobalTask && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-200/20 dark:via-blue-500/10 to-transparent animate-pulse pointer-events-none" />
              )}

              <CardContent className={`relative ${isCompact ? "p-2 pl-5" : "p-4"}`}>
                {/* DnD grip — the ONLY drag handle; separate from buttons (no nested-interactive) */}
                <button
                  type="button"
                  className="absolute left-0 top-3 flex h-8 w-5 cursor-grab items-center justify-center text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
                  aria-label={`Arrastar tarefa ${task.title}`}
                  {...provided.dragHandleProps}
                >
                  <GripVertical className="h-4 w-4" aria-hidden="true" />
                </button>

                {isPublicTask && !isCompact && (
                  <div className="absolute -top-2 right-6 z-10">
                    <div className="rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 p-1 shadow-lg">
                      <Crown className="h-4 w-4 text-white" aria-hidden="true" />
                    </div>
                  </div>
                )}

                <div className={`flex items-center gap-2 ${isCompact ? "" : "mb-3 items-start justify-between gap-2 pl-4"}`}>
                  <button
                    type="button"
                    className={isCompact ? "flex-1 text-left" : "flex-1 text-left"}
                    onClick={() => onOpenDetail(task)}
                    aria-label={`Ver detalhes de ${task.title}`}
                  >
                    <h3 className={`${isCompact ? "line-clamp-1 text-xs font-semibold" : "line-clamp-2 text-sm font-bold"} flex-1 pr-1 text-gray-900 dark:text-gray-100`}>
                      {task.title}
                      {isPublicTask && !isCompact && <span className="ml-1">⚡</span>}
                      {isGlobalTask && !isCompact && <span className="ml-1">🌍</span>}
                    </h3>
                  </button>

                  {isCompact ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {showsSubtaskLock && (
                        // No compacto o cartão não tem espaço para a checklist: só o número, com a
                        // frase do domínio no `title` (a mesma que o servidor devolve).
                        <Badge
                          variant="outline"
                          className="border-amber-400 text-[10px] font-bold text-amber-700 dark:border-amber-500/50 dark:text-amber-300"
                          title={openSubtasksMessage(openSubtasks.length, "review")}
                        >
                          <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                          {openSubtasks.length}
                        </Badge>
                      )}
                      <Badge
                        className="bg-gradient-to-r from-blue-500 to-indigo-500 text-[10px] font-bold text-white dark:from-blue-500/20 dark:to-indigo-500/20 dark:text-blue-300"
                        title={pointsBadgeTitle}
                      >
                        {POINTS_PER_TASK} pts
                      </Badge>
                      <TaskCardMenu
                        task={task}
                        isLeader={isLeader}
                        isCompact
                        onMove={handleMove}
                        onOpenDetail={onOpenDetail}
                        onEdit={onEdit}
                      />
                    </div>
                  ) : (
                    <TaskCardMenu
                      task={task}
                      isLeader={isLeader}
                      onMove={handleMove}
                      onOpenDetail={onOpenDetail}
                      onEdit={onEdit}
                    />
                  )}
                </div>

                {!isCompact && (
                  <>
                    {task.description && (
                      <p className="mb-3 line-clamp-2 pl-4 text-xs text-gray-600 dark:text-gray-400">
                        {task.description}
                      </p>
                    )}

                    <div className="mb-3 pl-4">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>Progresso</span>
                        <span>{STATUS_PROGRESS[task.status]}%</span>
                      </div>
                      <Progress
                        value={STATUS_PROGRESS[task.status]}
                        className="h-2"
                        aria-label={`Progresso de ${task.title}: ${STATUS_PROGRESS[task.status]}%`}
                      />
                    </div>

                    <div className="mb-3 flex flex-wrap gap-1 pl-4">
                      <Badge variant="outline" className={`text-xs font-bold ${priorityBadgeClass(task.priority)}`}>
                        <Flag className="mr-1 h-3 w-3" aria-hidden="true" />
                        {PRIORITY_LABEL[task.priority]}
                      </Badge>
                      <Badge variant="outline" className={`text-xs font-bold ${statusBadgeClass(task.status)}`}>
                        {STATUS_LABEL[task.status]}
                      </Badge>
                      {isPublicTask && (
                        <Badge className="animate-pulse bg-gradient-to-r from-yellow-400 to-amber-500 text-xs font-bold text-white dark:from-yellow-500/20 dark:to-amber-500/20 dark:text-yellow-300">
                          <Users className="mr-1 h-3 w-3" aria-hidden="true" />
                          PÚBLICA
                        </Badge>
                      )}
                      {isGlobalTask && (
                        <Badge className="animate-pulse bg-gradient-to-r from-blue-500 to-indigo-500 text-xs font-bold text-white dark:from-blue-500/20 dark:to-indigo-500/20 dark:text-blue-300">
                          <Zap className="mr-1 h-3 w-3" aria-hidden="true" />
                          QUEST GLOBAL
                        </Badge>
                      )}
                      <Badge
                        className="bg-gradient-to-r from-blue-500 to-indigo-500 text-xs font-bold text-white dark:from-blue-500/20 dark:to-indigo-500/20 dark:text-blue-300"
                        title={pointsBadgeTitle}
                      >
                        {POINTS_PER_TASK} pts
                      </Badge>
                    </div>

                    {showsSubtaskLock && (
                      // plan-v4 · V4-5 (DEC-80) — o aviso de trava com a checkbox que destrava.
                      // O cartão NÃO é a lista de subtasks: a lista completa, com criar/renomear/
                      // apagar, vive no diálogo de detalhe. Aqui entra só o que falta, porque é o
                      // que falta que trava. Tom âmbar: nada está errado, falta uma etapa.
                      <div className="mb-3 rounded-md border border-amber-300/80 bg-amber-50/80 px-2 py-1.5 dark:border-amber-500/40 dark:bg-amber-500/10">
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-900 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>{openSubtasksLabel}</span>
                          <span className="font-normal text-amber-800/70 dark:text-amber-300/70">
                            · {subtaskProgressLabel}
                          </span>
                        </div>
                        <ul className="mt-1.5 space-y-1">
                          {openSubtasks.map((subtask) => (
                            <li key={subtask.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`subtask-${subtask.id}`}
                                aria-label={`Concluir subtask ${subtask.title}`}
                                checked={false}
                                disabled={updateSubtask.isPending}
                                onCheckedChange={() => void handleCompleteSubtask(subtask)}
                              />
                              <label
                                htmlFor={`subtask-${subtask.id}`}
                                className="line-clamp-1 text-xs text-slate-700 dark:text-slate-200"
                              >
                                {subtask.title}
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {assigneeIds.length > 0 && (
                      <div className="mb-3 ml-4 rounded-md border border-slate-200/70 bg-white/60 px-2 py-1.5 dark:border-slate-700/70 dark:bg-slate-900/30">
                        <div className="flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          <User className="h-3 w-3" aria-hidden="true" />
                          <span>{assigneeIds.length > 1 ? "Delegados" : "Delegado"}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-700 dark:text-slate-200">
                          {assigneeIds
                            .map((id) => users.find((u) => u.id === id)?.name ?? `Membro #${id}`)
                            .slice(0, 3)
                            .join(", ")}
                        </p>
                      </div>
                    )}

                    {projectName && (
                      <p className="mb-2 ml-4 text-[11px] text-muted-foreground">Projeto: {projectName}</p>
                    )}

                    {canApproveReject && (
                      <TooltipProvider delayDuration={150}>
                        <div className="mt-3 ml-4 flex items-center gap-1.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                className="h-7 w-7 bg-green-500 text-white hover:bg-green-600 dark:bg-success dark:text-success-foreground dark:hover:bg-success/90"
                                aria-label="Aprovar tarefa"
                                // DEC-80: "nada termina com subtask aberta" vale também na
                                // aprovação, e a UI desabilita em vez de deixar levar o 400.
                                // A trava é sobre o destino, não sobre quem aprova.
                                disabled={openSubtasks.length > 0}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void handleApprove()
                                }}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {openSubtasks.length > 0
                                ? openSubtasksMessage(openSubtasks.length, "approve")
                                : "Aprovar"}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="destructive"
                                className="h-7 w-7"
                                aria-label="Rejeitar tarefa"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setRejectOpen(true)
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Rejeitar</TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    )}

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center space-x-2">
                        {task.dueDate && (
                          <span className="flex items-center">
                            <Calendar className="mr-1 h-3 w-3" aria-hidden="true" />
                            {formatDateOnly(task.dueDate)}
                          </span>
                        )}
                      </div>
                      {isOverdue && (
                        <span className="flex items-center font-bold text-destructive">
                          <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                          ATRASADA
                        </span>
                      )}
                      {isDueToday && !isOverdue && (
                        <span className="flex items-center font-semibold text-sky-600 dark:text-sky-400">
                          <CalendarClock className="mr-1 h-3 w-3" aria-hidden="true" />
                          Para hoje
                        </span>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </Draggable>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar tarefa</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa retornará para ajustes. Descreva o motivo — ele será anexado à descrição como
              &quot;FIX (data): motivo&quot; e enviado ao responsável.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Motivo da rejeição (opcional)"
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRejectConfirm()}>Rejeitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
