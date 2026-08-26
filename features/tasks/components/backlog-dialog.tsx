"use client"

/**
 * BacklogDialog — multiline import with project selection and date support.
 * Syntax: one task per line, optional `!priority`, `@points`, `#dd/mm` or `#dd/mm/yyyy`.
 * Role-gated project selector (COORDENADOR/GERENTE/GERENTE_PROJETO).
 * Collapsible help section with syntax reference and template button.
 */
import { useEffect, useMemo, useState } from "react"
import { HelpCircle, Info, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/contexts/auth-context"
import { useProjects } from "@/features/projects"
import { useTaskMutations, parseBacklogLines } from ".."

const BACKLOG_TEMPLATE = `Comprar reagentes !alta @30 #25/12
Calibrar equipamento @10 #15/03/2026
Testar sensor !urgente
Analisar dados !baixa @5 #01/01
Escrever relatório !media @20`

export interface BacklogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultProjectId?: number | null
}

export function BacklogDialog({ open, onOpenChange, defaultProjectId }: BacklogDialogProps) {
  const [raw, setRaw] = useState("")
  const [helpOpen, setHelpOpen] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>("none")
  const { user } = useAuth()
  const { data: projects = [] } = useProjects()
  const { createBacklog } = useTaskMutations()

  const userRoles: string[] = user?.roles ?? []
  const canSelectProject = ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"].some((r) =>
    userRoles.includes(r),
  )

  // Pre-select project from board filter when dialog opens
  useEffect(() => {
    if (open) {
      setRaw("")
      setSelectedProjectId(defaultProjectId ? String(defaultProjectId) : "none")
    }
  }, [open, defaultProjectId])

  const parsed = useMemo(() => parseBacklogLines(raw), [raw])

  const handleImport = async () => {
    if (parsed.length === 0) return
    const projectId = selectedProjectId !== "none" ? Number(selectedProjectId) : null
    try {
      const result = await createBacklog.mutateAsync(
        parsed.map((t) => ({
          title: t.title,
          priority: t.priority,
          points: t.points,
          dueDate: t.dueDate,
          projectId,
        })),
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

  const datesDetected = parsed.filter((t) => t.dueDate).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg sm:overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Inserir backlog
            <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Ajuda de sintaxe">
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </DialogTitle>
        </DialogHeader>

        <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
          <CollapsibleContent className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              Sintaxe — um item por linha
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span>
                <code className="font-mono">!alta</code> <code className="font-mono">!media</code>{" "}
                <code className="font-mono">!baixa</code> <code className="font-mono">!urgente</code>
              </span>
              <span className="text-muted-foreground">prioridade (opcional)</span>
              <span><code className="font-mono">@30</code></span>
              <span className="text-muted-foreground">pontos (opcional)</span>
              <span><code className="font-mono">#25/12</code> <code className="font-mono">#25/12/2026</code></span>
              <span className="text-muted-foreground">vencimento (opcional)</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => setRaw(BACKLOG_TEMPLATE)}
            >
              Usar modelo
            </Button>
          </CollapsibleContent>
        </Collapsible>

        {canSelectProject && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="backlog-project">
              Projeto
            </label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger id="backlog-project" aria-label="Selecionar projeto">
                <SelectValue placeholder="Nenhum projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum projeto</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Textarea
          rows={8}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={"Comprar reagentes !alta @30 #25/12\nCalibrar equipamento @10\nTestar sensor !urgente"}
          aria-label="Lista de tarefas para importação"
          className="font-mono text-sm"
        />

        <p className="text-xs text-muted-foreground" aria-live="polite">
          {parsed.length} tarefa(s) detectada(s)
          {datesDetected > 0 && ` · ${datesDetected} com vencimento`}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleImport()}
            disabled={parsed.length === 0 || createBacklog.isPending}
          >
            <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
            {createBacklog.isPending ? "Inserindo..." : `Inserir ${parsed.length || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
