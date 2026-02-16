"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { DragDropContext, type DropResult } from "@hello-pangea/dnd"
import { KanbanColumn } from "@/components/ui/kanban-column"
import { KanbanHeader } from "@/components/ui/kanban-header"
import { TaskDialog } from "@/components/features/task-dialog"
import { Loader2, AlertTriangle } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useTask } from "@/contexts/task-context"
import { useProject } from "@/contexts/project-context"
import type { ProjectMember, Task } from "@/contexts/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/contexts/use-toast"
import { hasAccess } from "@/lib/utils/utils"

const COLUMNS = [
  { id: "to-do", status: "to-do" },
  { id: "in-progress", status: "in-progress" },
  { id: "in-review", status: "in-review" },
  { id: "adjust", status: "adjust" },
  { id: "done", status: "done" },
]

export function KanbanBoard() {
  const { user } = useAuth()
  const { tasks, loading, error, fetchTasks, updateTask, completeTask } = useTask()
  const { projects } = useProject()
  const { toast } = useToast()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showOverdueOnly, setShowOverdueOnly] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [optimisticTasks, setOptimisticTasks] = useState<Task[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [isCompactView, setIsCompactView] = useState(false)

  const loadTasks = useCallback(() => {
    if (!user) return

    const canAccessAllProjects = hasAccess(user.roles || [], 'MANAGE_TASKS')
    if (!canAccessAllProjects) {
      const membershipProject = projects?.find((project) =>
        project.members?.some((member: ProjectMember) => member.userId === user.id)
      )
      if (membershipProject) {
        setSelectedProjectId(membershipProject.id)
      } else {
        setSelectedProjectId(null)
      }
    }

    fetchTasks(selectedProjectId)
  }, [user, fetchTasks, selectedProjectId, projects])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  useEffect(() => {
    setOptimisticTasks(tasks || [])
  }, [tasks])

  const overdueStatusMap = useMemo(() => {
    const map: { [id: string]: boolean } = {}
    if (optimisticTasks?.length > 0) {
      optimisticTasks.forEach((task) => {
        if (task?.id) {
          map[task.id] = isTaskOverdue(task)
        }
      })
    }
    return map
  }, [optimisticTasks])

  const filteredTasks = useMemo(() => {
    if (!optimisticTasks || !Array.isArray(optimisticTasks)) {
      return []
    }
    return optimisticTasks.filter((task) => (showOverdueOnly ? overdueStatusMap[task.id] : true))
  }, [optimisticTasks, showOverdueOnly, overdueStatusMap])

  const overdueTasksCount = useMemo(() => {
    if (!optimisticTasks || !Array.isArray(optimisticTasks)) {
      return 0
    }
    return optimisticTasks.filter((task) => overdueStatusMap[task.id]).length
  }, [optimisticTasks, overdueStatusMap])

  const canCreateTasks = hasAccess(user?.roles || [], 'MANAGE_TASKS')
  
  const canSeeProjectSelector = hasAccess(user?.roles || [], 'MANAGE_PROJECTS')
  
  const handleProjectChange = useCallback((projectId: number | null) => {
    setSelectedProjectId(projectId)
  }, [])

  const handleViewModeToggle = useCallback(() => {
    setIsCompactView(!isCompactView)
  }, [isCompactView])

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result

    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) {
      return
    }

    const isLeader = hasAccess(user?.roles || [], 'MANAGE_TASKS')

    if (source.droppableId === "done" && !isLeader) {
      toast({
        title: "Ação não permitida",
        description: "Apenas líderes de projeto podem mover tarefas concluídas.",
        variant: "destructive",
      });
      return;
    }

    if (result.reason === 'DROP') {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    try {
      setIsUpdating(true)
      if (!optimisticTasks || !Array.isArray(optimisticTasks)) {
        console.error("optimisticTasks is not available")
        return
      }
      const taskToUpdate = optimisticTasks.find((task) => task.id.toString() === draggableId)
      
      if (taskToUpdate) {

        const previousStatus = taskToUpdate.status
        const draggedStatus = destination.droppableId as "to-do" | "in-progress" | "in-review" | "adjust" | "done"
        const newStatus = draggedStatus === "done" && !isLeader ? "in-review" : draggedStatus

        const updatedTask = { ...taskToUpdate, status: newStatus }
        setOptimisticTasks(prev => {
          if (!prev || !Array.isArray(prev)) {
            return [updatedTask]
          }
          return prev.map(task => 
            task.id === taskToUpdate.id ? updatedTask : task
          )
        })

        const updateData: any = { status: newStatus }
        
        if (newStatus === "done" && taskToUpdate.taskVisibility === "public" && !taskToUpdate.assignedTo && user && hasAccess(user.roles || [], 'COMPLETE_PUBLIC_TASKS')) {
          updateData.assignedTo = user.id.toString()
        }
        
        if (newStatus === "done") {
          const userToAward = taskToUpdate.assignedTo || (taskToUpdate.taskVisibility === "public" && hasAccess(user?.roles || [], 'COMPLETE_PUBLIC_TASKS') ? user?.id : null)
          await completeTask(taskToUpdate.id, userToAward!)
        } else {
          await updateTask(taskToUpdate.id, updateData)
        }
        
        if (newStatus === "done" && previousStatus !== "done" && taskToUpdate.points > 0) {
          const userToAward = taskToUpdate.assignedTo || (taskToUpdate.taskVisibility === "public" && hasAccess(user?.roles || [], 'COMPLETE_PUBLIC_TASKS') ? user?.id : null)
          if (userToAward) {
            toast({
              title: "🎉 Tarefa Concluída!",
              description: `${taskToUpdate.points} pontos foram adicionados ao perfil do responsável.`,
              variant: "default",
            })
          }
        }
      }
    } catch (error) {
      console.error("Erro ao atualizar status da tarefa:", error)
      await fetchTasks()
      toast({
        title: "Erro",
        description: "Erro ao atualizar status da tarefa. Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleAddTask = () => {
    setEditingTask(null)
    setIsDialogOpen(true)
  }

  const handleEditTask = (task: Task) => {
    setEditingTask(task)
    setIsDialogOpen(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <KanbanHeader
        overdueCount={overdueTasksCount}
        showOverdueOnly={showOverdueOnly}
        onOverdueFilterChange={setShowOverdueOnly}
        canCreateTasks={canCreateTasks}
        onCreateTask={handleAddTask}
        isUpdating={isUpdating}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onProjectChange={handleProjectChange}
        showProjectSelector={canSeeProjectSelector}
        isCompactView={isCompactView}
        onViewModeToggle={handleViewModeToggle}
      />

      <DragDropContext onDragEnd={handleDragEnd}>
        <div 
          className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(300px,1fr))]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
        >
              {COLUMNS.map((column) => {
            const columnTasks = filteredTasks.filter((task) => task.status === column.status)
            return (
              <KanbanColumn
                key={column.id}
                status={column.status}
                tasks={columnTasks}
                onEdit={handleEditTask}
                onAddTask={handleAddTask}
                canAddTask={canCreateTasks}
                isCompactView={isCompactView}
              />
            )
          })}
        </div>
      </DragDropContext>

      <TaskDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        task={editingTask}
      />
    </div>
  )
}

function isTaskOverdue(task: Task): boolean {
  if (!task.dueDate) return false
  const dueDate = new Date(task.dueDate)
  const today = new Date()
  today.setHours(23, 59, 59, 999) 
  return dueDate < today && task.status !== "done"
}
