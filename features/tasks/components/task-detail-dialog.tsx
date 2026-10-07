"use client"

/**
 * TaskDetailDialog (E2/T2.6) — full details + permission-gated actions.
 * FIX lines ("FIX (dd/mm/yyyy): reason") render in a distinct "Ajustes solicitados" block (spec §3).
 * Destructive delete uses AlertDialog (A3).
 */
import { useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Calendar, Check, ListTodo, Pencil, Plus, Trash2, X } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import type { Task, TaskSubtask } from "@/entities/task"
import { useProjects } from "@/features/projects"
import { useUsers } from "@/features/users"
import {
  useTaskMutations,
  projectedAward,
  POINTS_PER_TASK,
  SUBTASK_POINTS,
  canMarkSubtasksOf,
  openSubtasksMessage,
  subtaskMarkMessage,
  subtaskWindowMessage,
  supportsSubtasks,
  SUBTASK_EDITABLE_STATUSES,
  SUBTASK_TITLE_MAX_LENGTH,
} from ".."
import { isTaskOverdue, isTaskDueToday } from "../utils/move-rules"
import { formatDateOnly } from "@/lib/date-only"

export interface TaskDetailDialogProps {
  task: Task | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (task: Task) => void
}

function splitFixInstructions(description: string | null | undefined) {
  if (!description) return { main: "", fixes: [] as string[] }
  const lines = description.split(/\n\n+/)
  const fixes: string[] = []
  const main: string[] = []
  for (const block of lines) {
    if (/^FIX\s*\(/i.test(block.trim())) fixes.push(block.trim())
    else main.push(block)
  }
  return { main: main.join("\n\n"), fixes }
}

export function TaskDetailDialog({ task, open, onOpenChange, onEdit }: TaskDetailDialogProps) {
  const { data: session } = useSession()
  const { data: projects = [] } = useProjects()
  const { data: users = [] } = useUsers()
  const { approve, reject, remove, createSubtask, updateSubtask, removeSubtask } = useTaskMutations()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  // V4-5b — estado da lista de subtasks (o diálogo é onde a lista inteira vive, DEC-89).
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("")
  const [renamingSubtaskId, setRenamingSubtaskId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [subtaskToDelete, setSubtaskToDelete] = useState<TaskSubtask | null>(null)

  if (!task) return null

  const userRoles = (session?.user as { roles?: string[] } | undefined)?.roles ?? []
  const userId = (session?.user as { id?: number } | undefined)?.id
  const canManageTasks =
    userRoles.includes("COORDENADOR") ||
    userRoles.includes("GERENTE") ||
    userRoles.includes("GERENTE_PROJETO") ||
    userRoles.includes("COLABORADOR") ||
    userRoles.includes("PESQUISADOR")
  const isAssignee = Boolean(userId && (task.assignedTo === userId || task.assigneeIds?.includes(userId)))
  const canApprove =
    task.status === "in-review" &&
    (userRoles.includes("COORDENADOR") ||
      userRoles.includes("GERENTE") ||
      (userRoles.includes("GERENTE_PROJETO") &&
        task.projectId != null &&
        projects.find((p) => p.id === task.projectId)?.leaderId === userId &&
        !isAssignee))
  const projectName = task.projectId ? projects.find((p) => p.id === task.projectId)?.name : null
  const { main, fixes } = splitFixInstructions(task.description)
  const isOverdue = isTaskOverdue(task)
  const isDueToday = isTaskDueToday(task)
  // plan-v3 OND1-D (DEC-30/DEC-40): o número exibido é o que o domínio calcula agora — o
  // `task.points` gravado é histórico e mente (o caso medido de "-37140 pts com 60 pts de base"
  // é o exemplo). O que foi de fato creditado em tarefa concluída chega na Onda 4.
  const projected = projectedAward(task)

  /**
   * V4-5b — a lista de subtasks (DEC-89, DEC-80, DEC-82).
   *
   * Porta de autoridade medida, não inventada: o servidor aceita quem tem `MANAGE_TASKS` ou
   * `MANAGE_USERS`, OU responsável da tarefa, OU criador/líder/membro do projeto
   * (`internal/task-view.ts:208-216`). A UI tem as duas primeiras portas neste componente —
   * `canManageTasks` é exatamente a lista de `MANAGE_TASKS` (`permissions.ts:22`) e `isAssignee` é a
   * segunda. As demais exigem consulta que este diálogo não faz; se a pessoa estiver numa delas e a
   * UI não oferecer, o servidor continua sendo quem decide (e o erro chega na tela).
   *
   * Janela (DEC-80): criar/renomear/apagar obedecem à janela; a MARCAÇÃO (`completed: true`)
   * obedece à trava de status da DEC-98 — mãe em Andamento, ou o servidor recusa com a mesma
   * frase que o toast mostra. Desmarcar não é marcação: livre fora de `done`.
   */
  const hasSubtaskSection = supportsSubtasks(task.taskVisibility, task.isGlobal)
  const subtasks = task.subtasks ?? []
  const openSubtasks = subtasks.filter((s) => !s.completed)
  const completedSubtasks = subtasks.filter((s) => s.completed)
  const canEditSubtasks = canManageTasks || isAssignee
  const subtaskWindowOpen = SUBTASK_EDITABLE_STATUSES.includes(task.status)
  const canCompleteSubtasks = task.status !== "done"
  // DEC-97 (2026-10-07): a base mostrada é a de HOJE — 10 + 5 por subtask concluída. A projeção
  // acima (`projectedAward`) conta as mesmas subtasks, então os dois números conversam.
  const basePoints = POINTS_PER_TASK + completedSubtasks.length * SUBTASK_POINTS

  const handleApprove = async () => {
    try {
      await approve.mutateAsync(task.id)
      toast.success("Tarefa aprovada")
      onOpenChange(false)
    } catch (error) {
      toast.error("Erro ao aprovar", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const handleReject = async () => {
    try {
      await reject.mutateAsync({ id: task.id, reason: rejectReason.trim() || undefined })
      toast.success("Tarefa rejeitada", { description: "Retornou para ajustes." })
      setRejectOpen(false)
      setRejectReason("")
      onOpenChange(false)
    } catch (error) {
      toast.error("Erro ao rejeitar", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const handleDelete = async () => {
    try {
      await remove.mutateAsync(task.id)
      toast.success("Tarefa excluída")
      setDeleteOpen(false)
      onOpenChange(false)
    } catch (error) {
      toast.error("Erro ao excluir", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  /** V4-5b — as quatro operações da lista. Erro chega na tela em todas: nada falha em silêncio. */
  const handleAddSubtask = async () => {
    const title = newSubtaskTitle.trim()
    if (!title) return
    try {
      await createSubtask.mutateAsync({ id: task.id, title })
      setNewSubtaskTitle("")
    } catch (error) {
      toast.error("Não foi possível criar a subtask", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const handleRenameSubtask = async (subtask: TaskSubtask) => {
    const title = renameDraft.trim()
    if (!title || title === subtask.title) {
      setRenamingSubtaskId(null)
      return
    }
    try {
      await updateSubtask.mutateAsync({ id: task.id, subtaskId: subtask.id, data: { title } })
      setRenamingSubtaskId(null)
    } catch (error) {
      toast.error("Não foi possível renomear a subtask", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const handleDeleteSubtask = async () => {
    if (!subtaskToDelete) return
    try {
      await removeSubtask.mutateAsync({ id: task.id, subtaskId: subtaskToDelete.id })
      setSubtaskToDelete(null)
    } catch (error) {
      toast.error("Não foi possível apagar a subtask", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const handleToggleSubtask = async (subtask: TaskSubtask, completed: boolean) => {
    // DEC-98: marcar exige a mãe em Andamento. A frase é a do domínio — a MESMA que a rota
    // devolve, então quem chega aqui por fora do gate ouve a mesma frase que quem passa.
    if (completed && !canMarkSubtasksOf(task.status)) {
      toast.error("Ação não permitida", { description: subtaskMarkMessage() })
      return
    }
    try {
      const result = await updateSubtask.mutateAsync({
        id: task.id,
        subtaskId: subtask.id,
        data: { completed },
      })
      // DEC-81: a última subtask concluída move a mãe para "Em Revisão". O diálogo diz isso —
      // sem a frase, a tarefa muda de coluna diante da pessoa sem explicação.
      if (completed && task.status === "in-progress" && result.task.status === "in-review") {
        toast.info("📋 Última subtask concluída — tarefa enviada para revisão", {
          description: "A tarefa foi enviada para revisão. Os pontos serão adicionados após aprovação.",
        })
      }
    } catch (error) {
      toast.error("Não foi possível alterar a subtask", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg sm:overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-6">{task.title}</DialogTitle>
            <DialogDescription>
              {projectName ? `Projeto: ${projectName}` : "Sem projeto"} •{" "}
              {task.taskVisibility === "public"
                ? "Pública"
                : task.taskVisibility === "private"
                  ? "Privada"
                  : "Delegada"}
              {task.isGlobal ? " • Quest Global 🌍" : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {main && <p className="whitespace-pre-wrap text-sm text-foreground/90">{main}</p>}

            {fixes.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-destructive">
                  Ajustes solicitados
                </p>
                {fixes.map((fix, i) => (
                  <p key={i} className="whitespace-pre-wrap text-sm text-destructive/90">
                    {fix}
                  </p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Criado por</p>
                <p className="font-semibold">
                  {task.createdBy
                    ? (users.find((u) => u.id === task.createdBy)?.name ?? `Usuário #${task.createdBy}`)
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {task.completed ? "Pontos (base)" : "Pontos"}
                </p>
                <p className="font-semibold">
                  {basePoints} pts
                  {!task.completed && projected !== basePoints && (
                    <span
                      className={`ml-2 text-xs font-normal ${projected < basePoints ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}
                    >
                      (se concluir agora: {projected} pts
                      {projected < basePoints ? " com penalidade" : " de bônus"})
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Prioridade</p>
                <p className="font-semibold capitalize">{task.priority}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Prazo</p>
                <p className="flex items-center gap-1 font-semibold">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatDateOnly(task.dueDate) || "—"}
                  {isOverdue && <Badge variant="destructive" className="ml-1">ATRASADA</Badge>}
                  {isDueToday && !isOverdue && <Badge variant="secondary" className="ml-1 bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">Para hoje</Badge>}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <p className="font-semibold">{task.status}</p>
              </div>
            </div>

            {task.assigneeIds && task.assigneeIds.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Responsáveis</p>
                <p className="text-sm">
                  {task.assigneeIds.map((id) => users.find((u) => u.id === id)?.name ?? `Membro #${id}`).join(", ")}
                </p>
              </div>
            )}

            {hasSubtaskSection && (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                    <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
                    Subtasks
                  </p>
                  {subtasks.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {subtasks.length - openSubtasks.length}/{subtasks.length} concluídas
                    </p>
                  )}
                </div>

                {subtasks.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {subtasks.map((subtask) => (
                      <li key={subtask.id} className="flex items-center gap-2">
                        <Checkbox
                          aria-label={`Concluir subtask ${subtask.title}`}
                          checked={subtask.completed}
                          disabled={!canCompleteSubtasks || updateSubtask.isPending}
                          onCheckedChange={(checked) => void handleToggleSubtask(subtask, checked === true)}
                        />
                        {renamingSubtaskId === subtask.id ? (
                          <>
                            <Input
                              aria-label="Novo título da subtask"
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              maxLength={SUBTASK_TITLE_MAX_LENGTH}
                              className="h-8 flex-1"
                            />
                            <Button
                              size="sm"
                              aria-label="Salvar título da subtask"
                              onClick={() => void handleRenameSubtask(subtask)}
                            >
                              Salvar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="Cancelar renomeação"
                              onClick={() => setRenamingSubtaskId(null)}
                            >
                              Cancelar
                            </Button>
                          </>
                        ) : (
                          <span
                            className={`flex-1 text-sm ${
                              subtask.completed
                                ? "text-muted-foreground line-through"
                                : "text-foreground/90"
                            }`}
                          >
                            {subtask.title}
                          </span>
                        )}
                        {canEditSubtasks && subtaskWindowOpen && renamingSubtaskId !== subtask.id && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              aria-label={`Renomear subtask ${subtask.title}`}
                              onClick={() => {
                                setRenamingSubtaskId(subtask.id)
                                setRenameDraft(subtask.title)
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              aria-label={`Apagar subtask ${subtask.title}`}
                              onClick={() => setSubtaskToDelete(subtask)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {canEditSubtasks && subtaskWindowOpen ? (
                  <div className="mt-2 flex gap-2">
                    <Input
                      aria-label="Nova subtask"
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      placeholder="Ex.: Revisar a introdução"
                      maxLength={SUBTASK_TITLE_MAX_LENGTH}
                      className="h-8 flex-1"
                    />
                    <Button
                      size="icon"
                      aria-label="Adicionar subtask"
                      onClick={() => void handleAddSubtask()}
                      disabled={!newSubtaskTitle.trim() || createSubtask.isPending}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ) : (
                  subtasks.length > 0 && (
                    // A frase é a do servidor (DEC-80), não uma paráfrase da UI: mesma origem,
                    // mesma cópia (`subtaskWindowMessage` foi movida para o domínio no V4-5a).
                    <p className="mt-2 text-xs text-muted-foreground">{subtaskWindowMessage(task.status)}</p>
                  )
                )}

                {openSubtasks.length > 0 && task.status !== "done" && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    {openSubtasksMessage(openSubtasks.length, task.status === "in-review" ? "approve" : "review")}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-wrap gap-2">
            {canApprove && (
              <>
                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => void handleApprove()}>
                  <Check className="mr-1 h-4 w-4" aria-hidden="true" /> Aprovar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)}>
                  <X className="mr-1 h-4 w-4" aria-hidden="true" /> Rejeitar
                </Button>
              </>
            )}
            {canManageTasks && (
              <Button size="sm" variant="outline" onClick={() => onEdit(task)}>
                <Pencil className="mr-1 h-4 w-4" aria-hidden="true" /> Editar
              </Button>
            )}
            {canManageTasks && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" /> Excluir
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar tarefa</AlertDialogTitle>
            <AlertDialogDescription>
              O motivo será anexado à descrição como &quot;FIX (data): motivo&quot; e enviado ao responsável.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <textarea
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Motivo (opcional)"
            aria-label="Motivo da rejeição"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleReject()}>Rejeitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir &quot;{task.title}&quot; é permanente e não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => void handleDelete()}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={subtaskToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setSubtaskToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar subtask</AlertDialogTitle>
            <AlertDialogDescription>
              Apagar &quot;{subtaskToDelete?.title}&quot; remove a linha da lista e muda a base de pontos da
              tarefa. O que outras pessoas já fizeram não é apagado junto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => void handleDeleteSubtask()}>
              Apagar subtask
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
