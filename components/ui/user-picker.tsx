"use client"

import { useId, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { cn } from "@/lib/utils/utils"

export interface UserPickerUser {
  id: number
  name?: string
  email?: string
}

interface UserPickerProps {
  users: UserPickerUser[]
  /** Id do usuário escolhido, como texto. String vazia = ninguém escolhido. */
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  className?: string
}

/** Minúsculas sem acento, para a busca ignores acentos e maiúsculas. */
function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function userLabel(user: UserPickerUser) {
  return user.name || `Usuário #${user.id}`
}

/**
 * Seletor de usuário com busca por texto.
 *
 * O `Select` do Radix não busca: com muitos usuários a lista vira rolagem longa e
 * quem sabe o nome de quem procura tinha que caçar linha por linha. Este é um
 * Popover com um campo de texto que filtra por nome e e-mail, e uma lista de
 * botões com o escolhido marcado.
 */
export function UserPicker({
  users,
  value,
  onValueChange,
  placeholder = "Escolha um usuário",
  searchPlaceholder = "Buscar por nome ou e-mail",
  emptyMessage = "Nenhum usuário encontrado.",
  disabled = false,
  className,
}: UserPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)
  const listId = useId()

  const filtered = useMemo(() => {
    const term = fold(query.trim())
    if (!term) return users
    return users.filter((user) =>
      fold(`${user.name ?? ""} ${user.email ?? ""}`).includes(term),
    )
  }, [users, query])

  const selected = users.find((user) => String(user.id) === value) ?? null

  function choose(user: UserPickerUser) {
    onValueChange(String(user.id))
    setOpen(false)
    setQuery("")
    setHighlight(0)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlight((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlight((current) => Math.max(current - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      const target = filtered[highlight]
      if (target) choose(target)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setQuery("")
          setHighlight(0)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          // `combobox` é um papel cujo nome não vem do conteúdo (diferente de `button`), então
          // sem este `aria-label` o gatilho não tem nome acessível nenhum — leitor de tela
          // anunciaria "combobox" e mais nada, e o teste por nome não acha nada.
          aria-label={selected ? `Usuário selecionado: ${userLabel(selected)}` : placeholder}
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? userLabel(selected) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setHighlight(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            className="h-9 border-0 shadow-none focus-visible:ring-0"
            aria-label={searchPlaceholder}
          />
        </div>
        <div id={listId} role="listbox" className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            filtered.map((user, index) => (
              <button
                key={user.id}
                type="button"
                role="option"
                aria-selected={String(user.id) === value}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(user)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                  index === highlight ? "bg-accent text-accent-foreground" : "",
                )}
              >
                <span className="truncate">
                  {userLabel(user)}
                  {user.email ? (
                    <span className="ml-2 text-xs text-muted-foreground">{user.email}</span>
                  ) : null}
                </span>
                {String(user.id) === value ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
