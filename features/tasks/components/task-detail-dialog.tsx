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
import { Calendar, Check, Pencil, Trash2, X } from "lucide-react"
import type { Task } from "@/entities/task"
import { useProjects } from "@/features/projects"
import { useUsers } from "@/features/users"
import { useTaskMutations, projectedAward } from ".."

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
  const { approve, reject, remove } = useTaskMutations()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  if (!task) return null

  const userRoles = (session?.user as { roles?: string[] } | undefined)?.roles ?? []
  const userId = (session?.user as { id?: number } | undefined)?.id
  const canManageTasks =
    userRoles.includes("COORDENADOR") ||
    userRoles.includes("GERENTE") ||
    userRoles.includes("GERENTE_PROJETO") ||
    userRoles.includes("COLABORADOR") ||
    userRoles.includes("PESQUISADOR")
  const canApprove =
    task.status === "in-review" &&
    (userRoles.includes("COORDENADOR") ||
      userRoles.includes("GERENTE") ||
      (userRoles.includes("GERENTE_PROJETO") &&
        task.projectId != null &&
        projects.find((p) => p.id === task.projectId)?.leaderId === userId))
  const isAssignee = Boolean(userId && (task.assignedTo === userId || task.assigneeIds?.includes(userId)))
  const projectName = task.projectId ? projects.find((p) => p.id === task.projectId)?.name : null
  const { main, fixes } = splitFixInstructions(task.description)
  const isOverdue = Boolean(task.dueDate) && task.status !== "done" && new Date(task.dueDate as string).getTime() < Date.now()

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
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Pontos</p>
                <p className="font-semibold">
                  {task.points} pts
                  {isOverdue && (
                    <span className="ml-2 text-xs font-normal text-destructive">
                      (agora: {projectedAward(task)} pts com penalidade)
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
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString("pt-BR") : "—"}
                  {isOverdue && <Badge variant="destructive" className="ml-1">ATRASADA</Badge>}
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
    </>
  )
}
