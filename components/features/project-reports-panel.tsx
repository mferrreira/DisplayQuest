"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, Loader2, Plus } from "lucide-react"
import { ProjectReportDialog, PERIOD_LABELS } from "@/components/features/project-report-dialog"
import { ProjectReportDetailDialog } from "@/components/features/project-report-detail-dialog"
import { useToast } from "@/contexts/use-toast"
import { REPORT_PERIOD_TYPES, type ReportPeriodType } from "@/lib/constants/report-periods"

interface ProjectReportListItem {
  id: number
  projectId: number
  projectName: string
  authorId: number
  authorName: string
  periodLabel: string
  title: string | null
  updatedAt: string
  attachments: Array<{ id: number }>
}

interface ProjectReportsPanelProps {
  projectId?: number
  /** Enables in-panel generation (project picker inside the dialog) when projectId is absent. */
  projects?: Array<{ id: number; name: string }>
}

export function ProjectReportsPanel({ projectId, projects }: ProjectReportsPanelProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState<ProjectReportListItem[]>([])
  const [periodFilter, setPeriodFilter] = useState<string>("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [detailReportId, setDetailReportId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (projectId) params.set("projectId", String(projectId))
      if (periodFilter !== "all") params.set("periodType", periodFilter)
      const res = await fetch(`/api/project-reports?${params.toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`)
      setReports(Array.isArray(data?.projectReports) ? data.projectReports : [])
    } catch (error) {
      setReports([])
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao carregar relatórios",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, periodFilter, toast])

  useEffect(() => {
    load()
  }, [load])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Relatórios de Projeto
        </CardTitle>
        <CardDescription>Relatórios por periodicidade com anexos, logs e sessões da janela</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Filtrar período" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as periodicidades</SelectItem>
              {REPORT_PERIOD_TYPES.map((type: ReportPeriodType) => (
                <SelectItem key={type} value={type}>{PERIOD_LABELS[type]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Gerar Relatório
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : reports.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Nenhum relatório registrado{periodFilter !== "all" ? " para esta periodicidade" : ""}.
          </div>
        ) : (
          <ul className="space-y-2">
            {reports.map((report) => (
              <li key={report.id} className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{report.title || report.periodLabel}</div>
                  <div className="text-xs text-muted-foreground">
                    {report.projectName} · {report.periodLabel} · por {report.authorName} · atualizado em{" "}
                    {new Date(report.updatedAt).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {report.attachments.length > 0 && (
                    <Badge variant="outline">{report.attachments.length} anexo(s)</Badge>
                  )}
                  <Button variant="outline" size="sm" onClick={() => { setDetailReportId(report.id); setDetailOpen(true) }}>
                    Abrir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!projectId && !projects && (
          <p className="text-xs text-muted-foreground">
            Dica: gere relatórios a partir do detalhe de um projeto específico.
          </p>
        )}
      </CardContent>

      <ProjectReportDialog
        projectId={projectId ?? 0}
        projects={projects}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={load}
      />
      <ProjectReportDetailDialog reportId={detailReportId} open={detailOpen} onOpenChange={setDetailOpen} />
    </Card>
  )
}
