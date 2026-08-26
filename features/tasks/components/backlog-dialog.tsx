"use client"

/**
 * BacklogDialog (E2/T2.6) — multiline import; one task per line.
 * Prefixes: `!alta|!media|!baixa|!urgente` priority, `@N` points (parseBacklogLines).
 * Replaces the 302-line legacy dialog with the shared pure parser.
 */
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useTaskMutations, parseBacklogLines } from ".."

export interface BacklogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BacklogDialog({ open, onOpenChange }: BacklogDialogProps) {
  const [raw, setRaw] = useState("")
  const { createBacklog } = useTaskMutations()

  useEffect(() => {
    if (open) setRaw("")
  }, [open])

  const parsed = useMemo(() => parseBacklogLines(raw), [raw])

  const handleImport = async () => {
    if (parsed.length === 0) return
    try {
      const result = await createBacklog.mutateAsync(
        parsed.map((t) => ({ title: t.title, priority: t.priority, points: t.points })),
      )
      toast.success("Backlog importado", {
        description: `${result.createdCount} tarefa(s) criada(s).`,
      })
      onOpenChange(false)
    } catch (error) {
      toast.error("Erro ao importar backlog", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar Backlog</DialogTitle>
          <DialogDescription>
            Uma tarefa por linha. Prefixos opcionais: <code className="font-mono text-xs">!alta</code>{" "}
            <code className="font-mono text-xs">!media</code>{" "}
            <code className="font-mono text-xs">!baixa</code>{" "}
            <code className="font-mono text-xs">!urgente</code> para prioridade,{" "}
            <code className="font-mono text-xs">@N</code> para pontos.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          rows={8}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={"Comprar reagentes !alta @30\nCalibrar equipamento @10\nTestar sensor !urgente"}
          aria-label="Lista de tarefas para importação"
        />

        <p className="text-xs text-muted-foreground" aria-live="polite">
          {parsed.length} tarefa(s) detectada(s)
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleImport()} disabled={parsed.length === 0 || createBacklog.isPending}>
            {createBacklog.isPending ? "Importando..." : `Importar ${parsed.length || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
