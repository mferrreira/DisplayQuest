"use client"

import { useId, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils/utils"
import { matchesText } from "@/lib/utils/text-search"

export interface MultiSelectUser {
  id: number
  name?: string
  email?: string
}

interface UserMultiSelectProps {
  users: MultiSelectUser[]
  /** Ids escolhidos. Conjunto VAZIO = todos visíveis (é o default da tela). */
  selected: Set<number>
  onChange: (selected: Set<number>) => void
  /** Rótulo do gatilho. */
  label?: string
  searchPlaceholder?: string
  /** Marcador por usuário (ex.: "sem horário"), desenhado ao lado do nome. */
  tagFor?: (user: MultiSelectUser) => string | undefined
  disabled?: boolean
  className?: string
}

/**
 * Filtro de membros da grade de horários: dropdown com caixas de seleção e busca.
 *
 * Medido em 2026-10-09: o filtro era uma faixa de etiquetas com o nome de cada
 * usuário. Com pouca gente funciona, mas a faixa só cresce — com dez usuários já
 * ocupava quatro linhas acima da grade, e achar alguém era varrer nome por nome.
 *
 * Regra mantida das etiquetas: **conjunto vazio = todos visíveis**. Marcar alguém
 * filtra a grade para os marcados; desmarcar o último volta a mostrar todos. A
 * linha "Todos" no topo faz o mesmo que desmarcar tudo.
 */
export function UserMultiSelect({
  users,
  selected,
  onChange,
  label = "Membros visíveis na grade",
  searchPlaceholder = "Buscar membro",
  tagFor,
  disabled = false,
  className,
}: UserMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const listId = useId()

  const filtered = useMemo(
    () => users.filter((user) => matchesText(query, [user.name, user.email])),
    [users, query],
  )

  const allVisible = selected.size === 0
  const summary = allVisible ? "todos" : `${selected.size} de ${users.length}`

  function toggle(userId: number) {
    const next = new Set(selected)
    if (next.has(userId)) next.delete(userId)
    else next.add(userId)
    onChange(next)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-expanded={open}
          aria-controls={listId}
          className={cn("justify-between gap-2", className)}
        >
          <span>
            {label}
            <span className="ml-1 text-muted-foreground">({summary})</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 border-0 shadow-none focus-visible:ring-0"
            aria-label={searchPlaceholder}
          />
        </div>
        <div id={listId} className="max-h-60 overflow-y-auto p-1">
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium",
              "hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Checkbox
              checked={allVisible}
              onCheckedChange={() => onChange(new Set())}
              aria-label="Todos"
            />
            <span>Todos</span>
          </label>
          <div className="my-1 h-px bg-border" role="separator" />
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Nenhum membro encontrado.</p>
          ) : (
            filtered.map((user) => {
              const tag = tagFor?.(user)
              return (
                <label
                  key={user.id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <Checkbox
                    checked={selected.has(user.id)}
                    onCheckedChange={() => toggle(user.id)}
                  />
                  <span className="truncate">{user.name || `Usuário #${user.id}`}</span>
                  {tag ? (
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{tag}</span>
                  ) : null}
                </label>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
