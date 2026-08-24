"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Upload, AlertTriangle, Filter, FolderOpen, LayoutGrid, List } from "lucide-react"

interface Project {
  id: number
  name: string
  status: string
}

interface KanbanHeaderProps {
  title?: string
  overdueCount?: number
  showOverdueOnly: boolean
  onOverdueFilterChange: (show: boolean) => void
  canCreateTasks?: boolean
  onCreateTask?: () => void
  onCreateBacklog?: () => void
  isUpdating?: boolean
  // Project selector props
  projects?: Project[]
  selectedProjectId?: number | null
  onProjectChange?: (projectId: number | null) => void
  showProjectSelector?: boolean
  // View mode props
  isCompactView?: boolean
  onViewModeToggle?: () => void
}

export function KanbanHeader({
  title = "Quadro Kanban",
  overdueCount = 0,
  showOverdueOnly,
  onOverdueFilterChange,
  canCreateTasks = false,
  onCreateTask,
  onCreateBacklog,
  isUpdating = false,
  projects = [],
  selectedProjectId,
  onProjectChange,
  showProjectSelector = false,
  isCompactView = false,
  onViewModeToggle
}: KanbanHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Project Selector Row */}
      {showProjectSelector && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-blue-600 dark:text-info" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-muted-foreground/50">Projeto:</span>
          </div>
          <Select
            value={selectedProjectId?.toString() || "all"}
            onValueChange={(value) => {
              const projectId = value === "all" ? null : parseInt(value)
              onProjectChange?.(projectId)
            }}
          >
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Selecione um projeto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os projetos</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id.toString()}>
                  <div className="flex items-center gap-2">
                    <span>{project.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {project.status}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Main Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          {overdueCount > 0 && (
            <div className="flex items-center text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-4 w-4 mr-1" />
              <span className="text-sm hidden sm:inline">
                {overdueCount} tarefa(s) atrasada(s)
              </span>
              <span className="text-sm sm:hidden">{overdueCount}</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* View Mode Toggle */}
          {onViewModeToggle && (
            <Button
              variant="outline"
              size="sm"
              onClick={onViewModeToggle}
              className="flex items-center gap-2"
            >
              {isCompactView ? (
                <>
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Expandido</span>
                </>
              ) : (
                <>
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline">Compacto</span>
                </>
              )}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Filtros</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem
                checked={showOverdueOnly}
                onCheckedChange={onOverdueFilterChange}
              >
                Mostrar apenas atrasadas
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {canCreateTasks && onCreateBacklog && (
            <Button variant="outline" onClick={onCreateBacklog} disabled={isUpdating}>
              <Upload className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Importar Backlog</span>
              <span className="sm:hidden">Backlog</span>
            </Button>
          )}
          {canCreateTasks && onCreateTask && (
            <Button onClick={onCreateTask} disabled={isUpdating}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Nova Tarefa</span>
              <span className="sm:hidden">Nova</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
} 