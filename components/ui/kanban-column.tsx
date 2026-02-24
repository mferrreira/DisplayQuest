"use client"

import { Droppable } from "@hello-pangea/dnd"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Clock, CheckCircle, AlertCircle, Edit, Eye, Zap, Star, Crown } from "lucide-react"
import { KanbanCard } from "@/components/ui/kanban-card"
import { KanbanCardCompact } from "@/components/ui/kanban-card-compact"
import type { Task, KanbanColumnProps } from "@/contexts/types"

const STATUS_CONFIG = {
  "to-do": {
    title: "A Fazer",
    icon: Clock,
    color: "bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900",
    borderColor: "border-gray-300 dark:border-gray-600",
    headerColor: "bg-gradient-to-r from-gray-500 to-slate-600 text-white",
    accentColor: "from-gray-400 to-slate-500"
  },
  "in-progress": {
    title: "Em Andamento",
    icon: Edit,
    color: "bg-gradient-to-br from-blue-50 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/20",
    borderColor: "border-blue-300 dark:border-blue-600",
    headerColor: "bg-gradient-to-r from-blue-500 to-cyan-600 text-white",
    accentColor: "from-blue-400 to-cyan-500"
  },
  "in-review": {
    title: "Em Revisão",
    icon: Eye,
    color: "bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-900/30 dark:to-violet-900/20",
    borderColor: "border-purple-300 dark:border-purple-600",
    headerColor: "bg-gradient-to-r from-purple-500 to-violet-600 text-white",
    accentColor: "from-purple-400 to-violet-500"
  },
  "adjust": {
    title: "Ajustes",
    icon: AlertCircle,
    color: "bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/20",
    borderColor: "border-orange-300 dark:border-orange-600",
    headerColor: "bg-gradient-to-r from-orange-500 to-amber-600 text-white",
    accentColor: "from-orange-400 to-amber-500"
  },
  "done": {
    title: "Concluído",
    icon: CheckCircle,
    color: "bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/20",
    borderColor: "border-green-300 dark:border-green-600",
    headerColor: "bg-gradient-to-r from-green-500 to-emerald-600 text-white",
    accentColor: "from-green-400 to-emerald-500"
  }
}

export function KanbanColumn({ status, tasks, onEdit, onAddTask, canAddTask, isCompactView = false }: KanbanColumnProps) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
  const Icon = config.icon

  const isTaskOverdue = (task: Task): boolean => {
    if (!task.dueDate) return false
    const dueDate = new Date(task.dueDate)
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    return dueDate < today && task.status !== "done"
  }

  return (
    <Card className={`${config.color} ${config.borderColor} h-[min(78vh,860px)] min-h-[460px] shadow-lg hover:shadow-xl transition-all duration-300 group relative overflow-hidden flex flex-col`}>
      {/* Animated background effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse pointer-events-none" />
      
      <CardHeader className={`${config.headerColor} sticky top-0 pb-3 relative z-20 border-b border-white/10 backdrop-blur supports-[backdrop-filter]:bg-black/10`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-white/20 rounded-lg">
              <Icon className="h-4 w-4" />
            </div>
            <CardTitle className="text-sm font-bold text-white">{config.title}</CardTitle>
            <Badge className={`text-xs font-bold bg-gradient-to-r ${config.accentColor} text-white border-white/20 shadow-lg`}>
              {tasks.length}
            </Badge>
          </div>
          {canAddTask && onAddTask && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddTask(status)}
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-all duration-300 bg-white/20 hover:bg-white/30 text-white"
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 relative z-10 flex-1 min-h-0 overflow-hidden">
        <Droppable droppableId={status}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`h-full min-h-[200px] overflow-y-auto pr-1 pb-2 space-y-2 transition-all duration-300 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/70 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600/70 [&::-webkit-scrollbar-track]:bg-transparent ${
                snapshot.isDraggingOver 
                  ? "bg-gradient-to-br from-blue-100/50 to-cyan-100/50 dark:from-blue-900/20 dark:to-cyan-900/10 rounded-lg p-2" 
                  : ""
              }`}
            >
              {tasks.map((task, index) => {
                const CardComponent = isCompactView ? KanbanCardCompact : KanbanCard
                return (
                  <CardComponent
                    key={task.id}
                    task={task}
                    onEdit={onEdit}
                    isOverdue={isTaskOverdue(task)}
                    index={index}
                  />
                )
              })}
              {provided.placeholder}
              
              {/* Empty state with gamified styling */}
              {tasks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="p-3 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-full mb-3">
                    <Icon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    Nenhuma tarefa
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Arraste uma tarefa aqui
                  </p>
                </div>
              )}
            </div>
          )}
        </Droppable>
      </CardContent>
    </Card>
  )
} 
