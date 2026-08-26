"use client"

/**
 * BoardToolbar (E2/T2.4) — legacy kanban-header parity + fixes:
 *  - overdue banner contrast (text-destructive on plain background — D-15.3)
 *  - action row wraps at 320px (legacy overflow fix, CP-1 observation)
 *  - filters are nuqs-backed (URL is source of truth)
 */
import { Filter, LayoutGrid, List, Plus, Rows3, TriangleAlert, Upload, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import type { TaskFilters } from "@/lib/api/endpoints/tasks"

export interface BoardToolbarProps {
  filters: TaskFilters
  onFiltersChange: (filters: TaskFilters) => void
  overdueCount: number
  canCreateTasks: boolean
  canSeeProjectSelector: boolean
  projects: Array<{ id: number; name: string }>
  isCompact: boolean
  onToggleCompact: () => void
  onCreateTask: () => void
  onCreateBacklog: () => void
  isUpdating: boolean
}

export function BoardToolbar({
  filters,
  onFiltersChange,
  overdueCount,
  canCreateTasks,
  canSeeProjectSelector,
  projects,
  isCompact,
  onToggleCompact,
  onCreateTask,
  onCreateBacklog,
  isUpdating,
}: BoardToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">Quadro Kanban</h2>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 text-sm font-semibold text-destructive">
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
              {overdueCount} tarefa(s) atrasada(s)
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleCompact}
            aria-pressed={isCompact}
          >
            {isCompact ? (
              <>
                <LayoutGrid className="mr-1 h-4 w-4" aria-hidden="true" /> Normal
              </>
            ) : (
              <>
                <Rows3 className="mr-1 h-4 w-4" aria-hidden="true" /> Compacto
              </>
            )}
          </Button>
          {canCreateTasks && (
            <>
              <Button variant="outline" size="sm" onClick={onCreateBacklog}>
                <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
                Importar Backlog
              </Button>
              <Button size="sm" onClick={onCreateTask} disabled={isUpdating}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                Nova Tarefa
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canSeeProjectSelector && (
          <Select
            value={filters.projectId?.toString() ?? "all"}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, projectId: value === "all" ? undefined : Number(value) })
            }
          >
            <SelectTrigger className="w-[220px]" aria-label="Filtrar tarefas por projeto">
              <SelectValue placeholder="Todos os projetos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os projetos</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id.toString()}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="relative">
          <Filter
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="w-[200px] pl-8"
            placeholder="Buscar tarefas..."
            aria-label="Buscar tarefas por título"
            value={filters.search ?? ""}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
          />
        </div>

        <Button
          variant={filters.overdue ? "secondary" : "outline"}
          size="sm"
          onClick={() => onFiltersChange({ ...filters, overdue: filters.overdue ? undefined : true })}
          aria-pressed={Boolean(filters.overdue)}
        >
          <List className="mr-1 h-4 w-4" aria-hidden="true" />
          Somente atrasadas
        </Button>

        <Button
          variant={filters.mine ? "secondary" : "outline"}
          size="sm"
          onClick={() => onFiltersChange({ ...filters, mine: filters.mine ? undefined : true })}
          aria-pressed={Boolean(filters.mine)}
        >
          <UserCheck className="mr-1 h-4 w-4" aria-hidden="true" />
          Atribuídas a mim
        </Button>

        {(filters.projectId || filters.overdue || filters.search || filters.mine) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFiltersChange({})}
          >
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  )
}
