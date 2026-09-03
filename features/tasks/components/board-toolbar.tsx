"use client"

/**
 * BoardToolbar (E2/T2.4) — legacy kanban-header parity + fixes:
 *  - overdue banner contrast (text-destructive on plain background — D-15.3)
 *  - action row wraps at 320px (legacy overflow fix, CP-1 observation)
 *  - filters are nuqs-backed (URL is source of truth)
 *  - search is an expanding icon (magnifier → input, GitHub-style)
 *  - "Atribuídas a mim" subsumed by the people select (current user = "(você)")
 */
import { useRef, useState } from "react"
import { LayoutGrid, List, Plus, Rows3, Search, TriangleAlert, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils/utils"
import type { TaskFilters } from "@/lib/api/endpoints/tasks"

export interface BoardToolbarProps {
  filters: TaskFilters
  onFiltersChange: (filters: TaskFilters) => void
  overdueCount: number
  canCreateTasks: boolean
  canSeeProjectSelector: boolean
  projects: Array<{ id: number; name: string }>
  users: Array<{ id: number; name: string }>
  /** Current session user id — rendered as the "(você)" entry in the people select. */
  currentUserId: number | null
  isCompact: boolean
  onToggleCompact: () => void
  onCreateTask: () => void
  isUpdating: boolean
}

export function BoardToolbar({
  filters,
  onFiltersChange,
  overdueCount,
  canCreateTasks,
  canSeeProjectSelector,
  projects,
  users,
  currentUserId,
  isCompact,
  onToggleCompact,
  onCreateTask,
  isUpdating,
}: BoardToolbarProps) {
  const [searchOpen, setSearchOpen] = useState(Boolean(filters.search))
  const searchRef = useRef<HTMLInputElement>(null)

  const currentUser = currentUserId ? users.find((u) => u.id === currentUserId) : undefined
  const otherUsers = users.filter((u) => u.id !== currentUserId)

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
            <Button size="sm" onClick={onCreateTask} disabled={isUpdating}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Nova Tarefa
            </Button>
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

        {/* Buscador expansível — ícone de lupa que expande em input (animação de largura). */}
        <div
          className={cn(
            "flex items-center overflow-hidden rounded-md border bg-background px-1.5 transition-[width] duration-300 ease-in-out",
            searchOpen ? "w-[200px]" : "w-9",
          )}
        >
          <button
            type="button"
            aria-label="Buscar tarefas"
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              setSearchOpen(true)
              requestAnimationFrame(() => searchRef.current?.focus())
            }}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
          <input
            ref={searchRef}
            className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Buscar tarefas..."
            aria-label="Buscar tarefas por título"
            tabIndex={searchOpen ? 0 : -1}
            value={filters.search ?? ""}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
            onBlur={() => {
              if (!(filters.search ?? "")) setSearchOpen(false)
            }}
          />
          <button
            type="button"
            aria-label="Limpar busca"
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              onFiltersChange({ ...filters, search: undefined })
              searchRef.current?.focus()
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <Select
          value={filters.assigneeId?.toString() ?? "all"}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, assigneeId: value === "all" ? undefined : Number(value) })
          }
        >
          <SelectTrigger className="w-[200px]" aria-label="Filtrar tarefas por pessoa">
            <Users className="mr-1 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <SelectValue placeholder="Todas as pessoas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as pessoas</SelectItem>
            {currentUser && (
              <SelectItem value={currentUser.id.toString()} className="font-medium">
                {currentUser.name} (você)
              </SelectItem>
            )}
            {otherUsers.map((u) => (
              <SelectItem key={u.id} value={u.id.toString()}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={filters.overdue ? "secondary" : "outline"}
          size="sm"
          onClick={() => onFiltersChange({ ...filters, overdue: filters.overdue ? undefined : true })}
          aria-pressed={Boolean(filters.overdue)}
        >
          <List className="mr-1 h-4 w-4" aria-hidden="true" />
          Somente atrasadas
        </Button>

        {(filters.projectId || filters.overdue || filters.search || filters.assigneeId) && (
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
