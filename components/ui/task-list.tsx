"use client"

import { useState } from "react"
import { TaskCard } from "@/components/ui/task-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Filter, SortAsc, SortDesc } from "lucide-react"
import type { Task } from "@/contexts/types"

interface TaskListProps {
  tasks: Task[]
  onEdit?: (task: Task) => void
  showSearch?: boolean
  showFilters?: boolean
  showSort?: boolean
  variant?: "default" | "compact" | "detailed"
  className?: string
  emptyMessage?: string
}

type SortOption = "title" | "priority" | "status" | "dueDate" | "points"
type SortDirection = "asc" | "desc"

export function TaskList({
  tasks,
  onEdit,
  showSearch = true,
  showFilters = true,
  showSort = true,
  variant = "default",
  className = "",
  emptyMessage = "Nenhuma tarefa encontrada"
}: TaskListProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<SortOption>("title")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

  const isTaskOverdue = (task: Task): boolean => {
    if (!task.dueDate) return false
    const dueDate = new Date(task.dueDate)
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    return dueDate < today && task.status !== "done"
  }

  const filteredAndSortedTasks = tasks
    .filter((task) => {
      const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (task.description && task.description.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchesStatus = statusFilter === "all" || task.status === statusFilter
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter
      
      return matchesSearch && matchesStatus && matchesPriority
    })
    .sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortBy) {
        case "title":
          aValue = a.title.toLowerCase()
          bValue = b.title.toLowerCase()
          break
        case "priority":
          const priorityOrder = { high: 3, medium: 2, low: 1 }
          aValue = priorityOrder[a.priority as keyof typeof priorityOrder] || 0
          bValue = priorityOrder[b.priority as keyof typeof priorityOrder] || 0
          break
        case "status":
          const statusOrder = { "to-do": 1, "in-progress": 2, "in-review": 3, "adjust": 4, "done": 5 }
          aValue = statusOrder[a.status] || 0
          bValue = statusOrder[b.status] || 0
          break
        case "dueDate":
          aValue = a.dueDate ? new Date(a.dueDate).getTime() : 0
          bValue = b.dueDate ? new Date(b.dueDate).getTime() : 0
          break
        case "points":
          aValue = a.points || 0
          bValue = b.points || 0
          break
        default:
          return 0
      }

      if (sortDirection === "asc") {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

  const toggleSortDirection = () => {
    setSortDirection(sortDirection === "asc" ? "desc" : "asc")
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search and Filters */}
      {(showSearch || showFilters || showSort) && (
        <div className="flex flex-col sm:flex-row gap-2">
          {showSearch && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted-foreground/70" />
              <Input
                placeholder="Buscar tarefas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          {showFilters && (
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="to-do">A Fazer</SelectItem>
                  <SelectItem value="in-progress">Em Andamento</SelectItem>
                  <SelectItem value="in-review">Em Revisão</SelectItem>
                  <SelectItem value="adjust">Ajustes</SelectItem>
                  <SelectItem value="done">Concluído</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {showSort && (
            <div className="flex gap-2">
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title">Título</SelectItem>
                  <SelectItem value="priority">Prioridade</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="dueDate">Data</SelectItem>
                  <SelectItem value="points">Pontos</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={toggleSortDirection}
                className="px-2"
              >
                {sortDirection === "asc" ? (
                  <SortAsc className="h-4 w-4" />
                ) : (
                  <SortDesc className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Task List */}
      {filteredAndSortedTasks.length > 0 ? (
        <div className="space-y-3">
          {filteredAndSortedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={onEdit}
              isOverdue={isTaskOverdue(task)}
              showActions={true}
              variant={variant}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-muted-foreground">
          <p>{emptyMessage}</p>
        </div>
      )}

      {/* Results Count */}
      {filteredAndSortedTasks.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-muted-foreground text-center">
          {filteredAndSortedTasks.length} de {tasks.length} tarefa(s)
        </div>
      )}
    </div>
  )
} 