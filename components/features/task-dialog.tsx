"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TaskForm } from "@/components/forms/task-form"
import { useUser } from "@/contexts/user-context"
import { useProject } from "@/contexts/project-context"
import { useTask } from "@/contexts/task-context"
import { useAuth } from "@/contexts/auth-context"
import { useState, useCallback } from "react"
import type { Task, TaskFormData } from "@/contexts/types"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Trash2, AlertCircle } from "lucide-react"
import { hasAccess } from "@/lib/utils/utils"

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: Task | null
  projectId?: string
}

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

export function TaskDialog({ open, onOpenChange, task, projectId }: TaskDialogProps) {
  const { users } = useUser()
  const { projects } = useProject()
  const { createTask, updateTask, deleteTask } = useTask()
  const { user: currentUser } = useAuth()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const canEditTasks = currentUser && hasAccess(currentUser.roles, "MANAGE_TASKS")
  const canCreateTasks = currentUser && hasAccess(currentUser.roles, "CREATE_TASK")
  const canDelete = !!task && !!currentUser && hasAccess(currentUser.roles, "MANAGE_TASKS")

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
      setError(err instanceof Error ? err.message : "Erro ao salvar tarefa")
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
      if (!newOpen) setError(null)
      onOpenChange(newOpen)
    }
  }, [isSubmitting, onOpenChange])

  const handleDelete = useCallback(async () => {
    if (!task) return
    if (!confirm("Tem certeza que deseja remover esta tarefa?")) return
    try {
      setIsDeleting(true)
      setError(null)
      await deleteTask(task.id)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover tarefa")
      console.error("TaskDialog - Error deleting task:", err)
    } finally {
      setIsDeleting(false)
    }
  }, [task, deleteTask, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mb-2">
            {error}
          </Alert>
        )}

        {task && !canEditTasks ? (
          <div className="p-6 text-center">
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Você não tem permissão para editar tarefas. Apenas coordenadores, gerentes, gerentes de projeto, colaboradores e pesquisadores podem editar tarefas.
              </AlertDescription>
            </Alert>
            <Button onClick={handleCancel} variant="outline">Fechar</Button>
          </div>
        ) : !task && !canCreateTasks ? (
          <div className="p-6 text-center">
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Você não tem permissão para criar tarefas. Apenas coordenadores, gerentes, gerentes de projeto, colaboradores e pesquisadores podem criar tarefas.
              </AlertDescription>
            </Alert>
            <Button onClick={handleCancel} variant="outline">Fechar</Button>
          </div>
        ) : (
          <TaskForm
            key={open ? (task?.id ?? "new") : "closed"}
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
        )}

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
