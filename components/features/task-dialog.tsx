"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TaskForm } from "@/components/forms/task-form"
import { useUser } from "@/contexts/user-context"
import { useProject } from "@/contexts/project-context"
import { useTask } from "@/contexts/task-context"
import { useAuth } from "@/contexts/auth-context"
import { useState, useCallback, useMemo, useEffect } from "react"
import type { Task, TaskFormData } from "@/contexts/types"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, AlertCircle } from "lucide-react"
import { hasAccess } from "@/lib/utils/utils"

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: Task | null
  projectId?: string
}

/**
 * Transforms form data to the format expected by the API
 */
const transformFormData = (formData: TaskFormData) => ({
  ...formData,
  assigneeIds: Array.from(
    new Set(
      (formData.assigneeIds || [])
        .map((id) => parseInt(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ),
  assignedTo: formData.assignedTo ? parseInt(formData.assignedTo) : null,
  projectId: formData.project ? parseInt(formData.project) : null,
})

/**
 * TaskDialog component for creating and editing tasks
 */
export function TaskDialog({ open, onOpenChange, task, projectId }: TaskDialogProps) {
  const { users } = useUser()
  const { projects } = useProject()
  const { createTask, createBacklog, updateTask, deleteTask } = useTask()
  const { user: currentUser } = useAuth()
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [creationMode, setCreationMode] = useState<"single" | "backlog">("single")
  const [backlogText, setBacklogText] = useState("")
  const [backlogProjectId, setBacklogProjectId] = useState<string>(projectId || "")
  const [backlogAssigneeIds, setBacklogAssigneeIds] = useState<string[]>([])
  const [backlogPriority, setBacklogPriority] = useState<"low" | "medium" | "high">("medium")
  const [backlogDueDate, setBacklogDueDate] = useState("")
  const [backlogPoints, setBacklogPoints] = useState(50)
  const [backlogTaskVisibility, setBacklogTaskVisibility] = useState<"public" | "delegated" | "private">("delegated")
  const [backlogIsGlobal, setBacklogIsGlobal] = useState(false)

  // Check if user can edit tasks
  const canEditTasks = currentUser && hasAccess(currentUser.roles, 'MANAGE_TASKS')
  const canCreateTasks = currentUser && hasAccess(currentUser.roles, 'CREATE_TASK')

  const handleSubmit = useCallback(async (formData: TaskFormData) => {
    try {
      setIsSubmitting(true)
      setError(null)

      const taskData = transformFormData(formData)

      if (task) {
        await updateTask(task.id, taskData)
      } else {
        await createTask(taskData)
      }

      onOpenChange(false)
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : "Erro ao salvar tarefa"
      
      setError(errorMessage)
      console.error("TaskDialog - Error saving task:", err)
    } finally {
      setIsSubmitting(false)
    }
  }, [task, createTask, updateTask, onOpenChange])

  const handleCancel = useCallback(() => {
    setError(null)
    onOpenChange(false)
  }, [onOpenChange])

  const handleDialogChange = useCallback((newOpen: boolean) => {
    if (!isSubmitting) {
      onOpenChange(newOpen)
    }
  }, [isSubmitting, onOpenChange])

  const canDelete = !!task && currentUser && hasAccess(currentUser.roles, 'MANAGE_TASKS');
  const canCreateGlobal = !!currentUser && (currentUser.roles.includes("COORDENADOR") || currentUser.roles.includes("GERENTE"))

  useEffect(() => {
    if (!open) return
    setCreationMode("single")
    setBacklogText("")
    setBacklogProjectId(projectId || "")
    setBacklogAssigneeIds(currentUser?.roles?.includes("GERENTE_PROJETO") ? [String(currentUser.id)] : [])
    setBacklogPriority("medium")
    setBacklogDueDate("")
    setBacklogPoints(50)
    setBacklogTaskVisibility("delegated")
    setBacklogIsGlobal(false)
  }, [open, projectId, currentUser])

  const backlogUserOptions = useMemo(
    () =>
      users
        .filter((user) => hasAccess(user.roles || [], "COMPLETE_PUBLIC_TASKS"))
        .map((user) => ({ value: String(user.id), label: user.name })),
    [users],
  )

  const backlogProjectOptions = useMemo(
    () => projects.map((project) => ({ value: String(project.id), label: project.name })),
    [projects],
  )

  const handleBacklogSubmit = useCallback(async () => {
    try {
      setIsSubmitting(true)
      setError(null)

      const lines = backlogText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)

      if (lines.length === 0) {
        throw new Error("Informe ao menos uma task no backlog (1 por linha).")
      }

      const normalizedAssigneeIds = Array.from(
        new Set(
          backlogAssigneeIds
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0),
        ),
      )

      if (!backlogIsGlobal && !backlogProjectId) {
        throw new Error("Selecione um projeto para inserir backlog.")
      }

      if (!backlogIsGlobal && backlogTaskVisibility !== "public" && normalizedAssigneeIds.length === 0) {
        throw new Error("Selecione ao menos um responsável para tasks atribuídas/privadas.")
      }

      const tasks = lines.map((line) => {
        const [titlePart, ...descriptionParts] = line.split("|")
        const title = titlePart.trim()
        const description = descriptionParts.join("|").trim()

        return {
          title,
          description,
          status: "to-do",
          priority: backlogPriority,
          assignedTo: backlogIsGlobal ? null : (normalizedAssigneeIds[0] ?? null),
          assigneeIds: backlogIsGlobal ? [] : normalizedAssigneeIds,
          projectId: backlogIsGlobal ? null : Number(backlogProjectId),
          dueDate: backlogDueDate || null,
          points: backlogPoints,
          completed: false,
          taskVisibility: backlogIsGlobal ? "public" : backlogTaskVisibility,
          isGlobal: backlogIsGlobal,
        }
      })

      await createBacklog(tasks)
      onOpenChange(false)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Erro ao criar backlog"
      setError(errorMessage)
      console.error("TaskDialog - Error creating backlog:", err)
    } finally {
      setIsSubmitting(false)
    }
  }, [
    backlogAssigneeIds,
    backlogDueDate,
    backlogIsGlobal,
    backlogPoints,
    backlogPriority,
    backlogProjectId,
    backlogTaskVisibility,
    backlogText,
    createBacklog,
    onOpenChange,
  ])

  const handleDelete = useCallback(async () => {
    if (!task) return
    if (!confirm("Tem certeza que deseja remover esta tarefa?")) return
    try {
      setIsDeleting(true)
      setError(null)
      await deleteTask(task.id)
      onOpenChange(false)
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : "Erro ao remover tarefa"
      setError(errorMessage)
      console.error("TaskDialog - Error deleting task:", err)
    } finally {
      setIsDeleting(false)
    }
  }, [task, deleteTask, onOpenChange])

  const dialogTitle = task ? "Editar Tarefa" : "Adicionar Nova Tarefa"

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-[600px] h-[90vh]" style={{ overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mb-2">
            {error}
          </Alert>
        )}

        {/* Show access denied message for volunteers trying to edit tasks */}
        {task && !canEditTasks ? (
          <div className="p-6 text-center">
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Você não tem permissão para editar tarefas. Apenas coordenadores, gerentes e gerentes de projeto podem editar tarefas.
              </AlertDescription>
            </Alert>
            <Button onClick={handleCancel} variant="outline">
              Fechar
            </Button>
          </div>
        ) : !task && !canCreateTasks ? (
          <div className="p-6 text-center">
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Você não tem permissão para criar tarefas. Apenas coordenadores, gerentes, gerentes de projeto e colaboradores podem criar tarefas.
              </AlertDescription>
            </Alert>
            <Button onClick={handleCancel} variant="outline">
              Fechar
            </Button>
          </div>
        ) : (
          <>
            {!task && (
              <div className="flex gap-2 mb-2">
                <Button
                  type="button"
                  variant={creationMode === "single" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCreationMode("single")}
                  disabled={isSubmitting}
                >
                  Tarefa Única
                </Button>
                <Button
                  type="button"
                  variant={creationMode === "backlog" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCreationMode("backlog")}
                  disabled={isSubmitting}
                >
                  Inserção de Backlog
                </Button>
              </div>
            )}

            {task || creationMode === "single" ? (
              <TaskForm
                key={open ? (task?.id ?? 'new') : 'closed'}
                task={task}
                users={users}
                projects={projects}
                currentUser={currentUser}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                isSubmitting={isSubmitting}
                error={error}
                projectId={projectId}
                open={open}
              />
            ) : (
              <div className="space-y-4">
                <Alert>
                  <AlertDescription>
                    Cole uma task por linha. Opcionalmente use `Título | Descrição`.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Projeto</Label>
                    <Select
                      value={backlogProjectId}
                      onValueChange={setBacklogProjectId}
                      disabled={backlogIsGlobal}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={backlogIsGlobal ? "Não aplicável (global)" : "Selecione um projeto"} />
                      </SelectTrigger>
                      <SelectContent>
                        {backlogProjectOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>Tipo da Task</Label>
                    <Select
                      value={backlogTaskVisibility}
                      onValueChange={(v) => setBacklogTaskVisibility(v as any)}
                      disabled={backlogIsGlobal}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="delegated">Atribuída</SelectItem>
                        <SelectItem value="public">Geral (membros podem pegar)</SelectItem>
                        <SelectItem value="private">Privada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2 col-span-2">
                    <Label>
                      Responsáveis (múltiplos) {backlogTaskVisibility === "public" ? "(opcional)" : "(obrigatório)"}
                    </Label>
                    <div className={`max-h-40 overflow-y-auto rounded-md border p-2 space-y-2 ${backlogIsGlobal ? "opacity-60" : ""}`}>
                      {backlogUserOptions.map((option) => {
                        const checked = backlogAssigneeIds.includes(option.value)
                        return (
                          <label key={option.value} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={backlogIsGlobal}
                              onChange={(e) => {
                                setBacklogAssigneeIds((prev) => {
                                  if (e.target.checked) return Array.from(new Set([...prev, option.value]))
                                  return prev.filter((id) => id !== option.value)
                                })
                              }}
                            />
                            <span>{option.label}</span>
                          </label>
                        )
                      })}
                      {backlogUserOptions.length === 0 && (
                        <p className="text-xs text-muted-foreground">Nenhum usuário elegível encontrado.</p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Prioridade</Label>
                    <Select value={backlogPriority} onValueChange={(v) => setBacklogPriority(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baixa</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>Data de vencimento</Label>
                    <Input type="date" value={backlogDueDate} onChange={(e) => setBacklogDueDate(e.target.value)} />
                  </div>

                  <div className="grid gap-2">
                    <Label>Pontos</Label>
                    <Input
                      type="number"
                      min={0}
                      value={backlogPoints}
                      onChange={(e) => setBacklogPoints(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>

                {canCreateGlobal && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={backlogIsGlobal}
                      onChange={(e) => {
                        setBacklogIsGlobal(e.target.checked)
                        if (e.target.checked) {
                          setBacklogTaskVisibility("public")
                          setBacklogAssigneeIds([])
                        }
                      }}
                    />
                    Criar como Quest Global (uma por linha)
                  </label>
                )}

                <div className="grid gap-2">
                  <Label>Backlog (uma task por linha)</Label>
                  <Textarea
                    rows={10}
                    value={backlogText}
                    onChange={(e) => setBacklogText(e.target.value)}
                    placeholder={"Ex.:\\nRefatorar tela de projetos | alinhar cards e filtros\\nRevisar rotas de tarefas\\nCriar documentação de onboarding"}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={handleBacklogSubmit} disabled={isSubmitting}>
                    {isSubmitting ? "Criando..." : "Criar Backlog"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Botão de remover tarefa, só aparece para papéis permitidos e se for edição */}
        {canDelete && (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || isSubmitting}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? "Removendo..." : "Remover Tarefa"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
