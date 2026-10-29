"use client"

import { Archive, ChevronDown } from "lucide-react"
import type { Task } from "@/entities/task"

/**
 * "Concluídas antigas" — o recolhimento que devolve acesso às tarefas arquivadas
 * (concluídas há mais de ARCHIVE_AFTER_DAYS, removidas das colunas). A troca do card
 * "Histórico" pelo feed "Atividade recente" deixou esses registros sem caminho nenhum;
 * o dono escolheu trazê-los de volta como bloco discreto expansível junto do feed.
 *
 * `<details>/<summary>` dá o recolhimento e o teclado de graça, sem estado de componente.
 */
export function ArchivedTasksDisclosure({ archived }: { archived: readonly Task[] }) {
  if (archived.length === 0) return null

  const sorted = [...archived].sort((a, b) => {
    const at = a.completedAt ?? a.dueDate ?? ""
    const bt = b.completedAt ?? b.dueDate ?? ""
    return bt.localeCompare(at)
  })

  return (
    <details className="mt-3 rounded-lg border bg-card p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-muted-foreground">
        <span className="flex items-center gap-2">
          <Archive className="h-4 w-4" aria-hidden="true" /> Concluídas antigas ({sorted.length})
        </span>
        <ChevronDown
          className="h-4 w-4 transition-transform [[open]>&]:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ul className="mt-3 max-h-72 divide-y divide-border overflow-y-auto pr-1">
        {sorted.map((task) => (
          <li key={task.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{task.title}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {task.points} pts
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {task.completedAt ? new Date(task.completedAt).toLocaleDateString("pt-BR") : "—"}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
