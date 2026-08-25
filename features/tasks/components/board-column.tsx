"use client"

/**
 * BoardColumn (E2/T2.4) — legacy kanban-column parity: saturated header + count + empty state.
 */
import { Droppable } from "@hello-pangea/dnd"
import { PenLine, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Task, TaskStatus } from "@/entities/task"
import { TaskCard } from "./task-card"

const COLUMN_STYLES: Record<TaskStatus, { header: string; icon: string }> = {
  "to-do": { header: "bg-gradient-to-r from-slate-700 to-gray-600", icon: "🕐" },
  "in-progress": { header: "bg-gradient-to-r from-blue-600 to-cyan-500", icon: "✏️" },
  "in-review": { header: "bg-gradient-to-r from-purple-600 to-violet-500", icon: "👁️" },
  adjust: { header: "bg-gradient-to-r from-orange-600 to-amber-500", icon: "⚠️" },
  done: { header: "bg-gradient-to-r from-emerald-600 to-green-500", icon: "✅" },
}

const COLUMN_TITLES: Record<TaskStatus, string> = {
  "to-do": "A Fazer",
  "in-progress": "Em Andamento",
  "in-review": "Em Revisão",
  adjust: "Ajustes",
  done: "Concluído",
}

export interface BoardColumnProps {
  status: TaskStatus
  tasks: Task[]
  canAddTask: boolean
  onAddTask: () => void
  onEdit: (task: Task) => void
  onOpenDetail: (task: Task) => void
}

export function BoardColumn({ status, tasks, canAddTask, onAddTask, onEdit, onOpenDetail }: BoardColumnProps) {
  const style = COLUMN_STYLES[status]
  const title = COLUMN_TITLES[status]

  return (
    <div className="flex min-h-[400px] flex-col overflow-hidden rounded-xl border bg-muted/30 shadow-sm">
      <div className={`flex items-center justify-between px-3 py-3 ${style.header}`}>
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <span aria-hidden="true">{style.icon}</span>
          <h2 className="tracking-tight">{title}</h2>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold text-white">
            {tasks.length}
          </span>
          {canAddTask && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-white hover:bg-white/20"
              onClick={onAddTask}
              aria-label={`Adicionar tarefa em ${title}`}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 space-y-0 p-3 ${snapshot.isDraggingOver ? "bg-accent/40" : ""}`}
            aria-label={`Coluna ${title}`}
          >
            {tasks.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
                <PenLine className="h-6 w-6 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Nenhuma tarefa</p>
                <p className="text-xs text-muted-foreground/70">Arraste uma tarefa aqui</p>
              </div>
            ) : (
              tasks.map((task, index) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={index}
                  isOverdue={
                    Boolean(task.dueDate) &&
                    task.status !== "done" &&
                    new Date(task.dueDate as string).getTime() < Date.now()
                  }
                  onEdit={onEdit}
                  onOpenDetail={onOpenDetail}
                />
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}
