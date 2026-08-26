"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { FileUp, Loader2, X } from "lucide-react"
import { computePeriod, REPORT_PERIOD_TYPES, type ReportPeriodType } from "@/lib/constants/report-periods"
import { useToast } from "@/contexts/use-toast"

const PERIOD_LABELS: Record<ReportPeriodType, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  semiannual: "Semestral",
  annual: "Anual",
}

interface ProjectReportDialogProps {
  projectId: number
  /** When projectId is 0/absent, a selectable project list enables generation from a global page. */
  projects?: Array<{ id: number; name: string }>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function ProjectReportDialog({ projectId, projects, open, onOpenChange, onSaved }: ProjectReportDialogProps) {
  const { toast } = useToast()
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [periodType, setPeriodType] = useState<ReportPeriodType>("biweekly")
  const [reference, setReference] = useState<string>("")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const needsProjectPicker = !projectId && Array.isArray(projects) && projects.length > 0
  const effectiveProjectId = projectId || Number(selectedProjectId) || 0

  function reset() {
    setSelectedProjectId("")
    setTitle("")
    setContent("")
    setFiles([])
  }

  const periodPreview = useMemo(() => {
    const refDate = reference ? new Date(`${reference}T12:00:00`) : new Date()
    if (Number.isNaN(refDate.getTime())) return ""
    return computePeriod(periodType, refDate).label
  }, [periodType, reference])

  async function handleSubmit() {
    if (!effectiveProjectId) {
      toast({ title: "Erro", description: "Selecione um projeto.", variant: "destructive" })
      return
    }
    if (!content.trim()) {
      toast({ title: "Erro", description: "Escreva o conteúdo do relatório.", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const form = new FormData()
      form.set("projectId", String(effectiveProjectId))
      form.set("periodType", periodType)
      form.set("content", content)
      if (title.trim()) form.set("title", title.trim())
      if (reference) form.set("reference", reference)
      for (const file of files) form.append("files", file)

      const res = await fetch("/api/project-reports", { method: "POST", body: form })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Erro ${res.status}`)
      }
      toast({ title: data.created ? "Sucesso" : "Atualizado", description: data.created ? "Relatório enviado." : "Relatório existente atualizado (mesma janela)." })
      reset()
      onOpenChange(false)
      onSaved?.()
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Falha ao salvar relatório", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto sm:overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar Relatório de Projeto</DialogTitle>
          <DialogDescription>
            Selecione a periodicidade, escreva o que foi feito e anexe materiais de apoio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {needsProjectPicker && (
            <div className="space-y-2">
              <Label>Projeto *</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={projects!.length ? "Selecione um projeto" : "Nenhum projeto disponível"} />
                </SelectTrigger>
                <SelectContent>
                  {projects!.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Periodicidade</Label>
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as ReportPeriodType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_PERIOD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{PERIOD_LABELS[type]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-reference">Data de referência (opcional)</Label>
              <Input id="report-reference" type="date" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>

          {periodPreview && (
            <Badge variant="secondary">Janela: {periodPreview}</Badge>
          )}

          <div className="space-y-2">
            <Label htmlFor="report-title">Título (opcional)</Label>
            <Input id="report-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Avanços no ensaio X" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-content">O que foi feito *</Label>
            <Textarea
              id="report-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="Descreva as atividades, resultados e pendências do período..."
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2"><FileUp className="h-4 w-4" /> Anexos (máx. 20 MB por arquivo)</Label>
            <Input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,video/mp4,video/webm,video/quicktime"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <ul className="text-sm space-y-1">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 border rounded px-2 py-1">
                    <span className="truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                    <button type="button" aria-label={`Remover ${file.name}`} onClick={() => setFiles(files.filter((_, i) => i !== index))}>
                      <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !effectiveProjectId}>
            {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</>) : "Enviar relatório"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { PERIOD_LABELS }
