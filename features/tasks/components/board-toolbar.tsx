"use client"

/**
 * BoardToolbar (E2/T2.4) — legacy kanban-header parity + fixes:
 *  - overdue banner contrast (text-destructive on plain background — D-15.3)
 *  - action row wraps at 320px (legacy overflow fix, CP-1 observation)
 *  - filters are nuqs-backed (URL is source of truth)
 *  - search is expanded by default on desktop (≥ `sm`); the magnifier toggle is mobile-only
 *  - "Atribuídas a mim" subsumed by the people select (current user = "(você)")
 */
import { useRef, useState, useSyncExternalStore } from "react"
import { CalendarClock, LayoutGrid, Plus, Rows3, Search, TriangleAlert, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils/utils"
import type { TaskFilters } from "@/lib/api/endpoints/tasks"

/**
 * Breakpoint `sm` do Tailwind (640px) — o mesmo que a classe `sm:` usada no JSX abaixo.
 * As duas coisas precisam concordar: se o CSS disser "desktop" e o JS disser "mobile",
 * o campo aparece aberto mas com `tabIndex={-1}` (teclado não alcança) e recolhe no blur.
 */
const DESKTOP_QUERY = "(min-width: 640px)"

/** `null` quando não há `matchMedia` (navegador antigo, e o jsdom do Vitest, que não tem). */
function desktopMedia(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null
  return window.matchMedia(DESKTOP_QUERY)
}

function subscribeToDesktop(onChange: () => void) {
  const mql = desktopMedia()
  if (!mql) return () => {}
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/**
 * `false` no servidor e na hidratação — o que mantém o markup do servidor e o do primeiro
 * render do cliente iguais. Não há flash: o *layout* desktop é garantido por CSS
 * (`sm:w-[200px]` no contêiner, `sm:hidden` na lupa), então o que este hook decide é só
 * comportamento invisível (`tabIndex` e o collapse de blur).
 */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeToDesktop,
    () => desktopMedia()?.matches ?? false,
    () => false,
  )
}

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
  // No desktop não há toggle: o campo nasce aberto e nunca recolhe.
  const isDesktop = useIsDesktop()
  const searchExpanded = isDesktop || searchOpen
  const searchTerm = filters.search ?? ""

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

        {/* h-10 em toda a barra: os SelectTrigger são `h-10` e o `Button` default também
            (o `size="sm"` é `h-9` e destoava 4px deles na mesma fileira). */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
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
            <Button onClick={onCreateTask} disabled={isUpdating}>
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={filters.overdue || filters.dueToday ? "secondary" : "outline"}
              aria-pressed={Boolean(filters.overdue || filters.dueToday)}
            >
              <CalendarClock className="mr-1 h-4 w-4" aria-hidden="true" />
              Vencimento
              {(filters.overdue || filters.dueToday) && (
                <span aria-hidden="true">
                  {" "}
                  • {[filters.overdue, filters.dueToday].filter(Boolean).length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuCheckboxItem
              checked={Boolean(filters.overdue)}
              onCheckedChange={(checked) =>
                onFiltersChange({ ...filters, overdue: checked ? true : undefined })
              }
            >
              Somente atrasadas
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={Boolean(filters.dueToday)}
              onCheckedChange={(checked) =>
                onFiltersChange({ ...filters, dueToday: checked ? true : undefined })
              }
            >
              Para hoje
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {(filters.projectId || filters.overdue || filters.dueToday || filters.search || filters.assigneeId) && (
          <Button
            variant="ghost"
            onClick={() => onFiltersChange({})}
          >
            Limpar filtros
          </Button>
        )}

        {/* Buscador — no canto direito (ml-auto), não entre os selects.
            Desktop (≥ `sm`): nasce aberto e não tem toggle; o `sm:w-[200px]` segura a
            largura mesmo com `searchOpen === false`, e a lupa some (`sm:hidden`).
            Mobile: a lupa abre o campo e o blur o recolhe se estiver vazio. */}
        <div
          className={cn(
            "ml-auto flex h-10 items-center overflow-hidden rounded-md border bg-background px-2 transition-[width] duration-300 ease-in-out",
            searchExpanded ? "w-[200px]" : "w-9 sm:w-[200px]",
          )}
        >
          <button
            type="button"
            aria-label="Buscar tarefas"
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground sm:hidden"
            onClick={() => {
              setSearchOpen(true)
              requestAnimationFrame(() => searchRef.current?.focus())
            }}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
          {/* No desktop a lupa é só o ícone do campo — decorativa, sem toggle. */}
          <Search className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
          <input
            ref={searchRef}
            className="h-full w-full min-w-0 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Buscar tarefas..."
            aria-label="Buscar tarefas por título"
            tabIndex={searchExpanded ? 0 : -1}
            value={searchTerm}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
            onBlur={() => {
              if (!isDesktop && !searchTerm) setSearchOpen(false)
            }}
          />
          {/* Sem texto não há o que limpar: o X ficaria visível o tempo todo no desktop. */}
          {searchTerm && (
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
          )}
        </div>
      </div>
    </div>
  )
}
