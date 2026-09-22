"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Download, Loader2, Paperclip, Printer, ListFilter, ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { groupByPerson, type ReportDisplayMode } from "@/lib/reports/grouping"

interface Attachment {
  id: number
  fileName: string
  storedPath: string
  mimeType: string
  sizeBytes: number
}

interface AggregateReport {
  report: {
    id: number
    projectName: string
    authorName: string
    periodLabel: string
    periodStart: string
    periodEnd: string
    title: string | null
    content: string
    attachments: Attachment[]
  }
  logs: Array<{ id: number; userName: string | null; date: string; startTime: string | null; endTime: string | null; note: string | null }>
  sessions: Array<{ id: number; userName: string; startTime: string; endTime: string | null; durationHours: number | null; activity: string | null }>
  totals: { logCount: number; sessionCount: number; totalHours: number }
}

export function ProjectReportDetailDialog({
  reportId,
  open,
  onOpenChange,
}: {
  reportId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [data, setData] = useState<AggregateReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [displayMode, setDisplayMode] = useState<ReportDisplayMode>("grouped")

  useEffect(() => {
    if (!open || !reportId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    fetch(`/api/project-reports/${reportId}/aggregate`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`)
        return json as AggregateReport
      })
      .then((json) => { if (!cancelled) setData(json) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, reportId])

  const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })

  const displayModeLabel = displayMode === "grouped"
    ? "Agrupado por pessoa"
    : displayMode === "chronological" ? "Cronológico" : "Ordem original"

  const logRange = (log: AggregateReport["logs"][number]) =>
    log.startTime && log.endTime
      ? `${fmt(log.startTime)} → ${fmt(log.endTime)}`
      : fmt(log.startTime ?? log.date)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto sm:overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.report.title || "Relatório de Projeto"}</DialogTitle>
          <DialogDescription>
            {data ? `${data.report.periodLabel} · ${data.report.projectName} · por ${data.report.authorName}` : "Carregando..."}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        )}

        {error && (
          <div className="text-sm text-destructive">{error}</div>
        )}

        {data && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">{data.totals.sessionCount} sessões</Badge>
              <Badge variant="secondary">{data.totals.logCount} logs</Badge>
              <Badge variant="secondary">{data.totals.totalHours.toFixed(1)}h totais</Badge>
              <span className="text-xs text-muted-foreground self-center">
                Janela: {fmt(data.report.periodStart)} → {fmt(data.report.periodEnd)}
              </span>
              <span className="flex-1" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ListFilter className="mr-2 h-4 w-4" />
                    {displayModeLabel}
                    <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDisplayMode("grouped")}>
                    Agrupar por pessoa (A→Z)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDisplayMode("chronological")}>
                    Cronológico
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDisplayMode("original")}>
                    Ordem original
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="rounded-md border p-3 whitespace-pre-wrap text-sm">{data.report.content}</div>

            {data.report.attachments.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium flex items-center gap-2">
                  <Paperclip className="h-4 w-4" /> Anexos ({data.report.attachments.length})
                </div>
                <ul className="space-y-1">
                  {data.report.attachments.map((attachment) => (
                    <li key={attachment.id} className="flex items-center justify-between gap-2 border rounded px-2 py-1 text-sm">
                      <a href={`/api/report-files/${attachment.storedPath}`} target="_blank" rel="noreferrer" className="truncate underline-offset-2 hover:underline">
                        {attachment.fileName}
                      </a>
                      <span className="text-xs text-muted-foreground">{(attachment.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.sessions.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium">Sessões de trabalho na janela</div>
                <ScrollArea className="max-h-60 rounded-md border p-2">
                  <ul className="text-sm space-y-3">
                    {groupByPerson(data.sessions, displayMode).map((section) => (
                      <li key={section.key}>
                        {section.label && <div className="mb-1 font-medium text-muted-foreground">{section.label}</div>}
                        <ul className="space-y-1">
                          {section.items.map((session) => (
                            <li key={session.id} className="flex items-center gap-2 flex-wrap">
                              {displayMode !== "grouped" && <Badge variant="outline">{session.userName}</Badge>}
                              <span className="text-xs text-muted-foreground">{fmt(session.startTime)}</span>
                              {session.endTime && (
                                <span className="text-xs text-muted-foreground">→ {fmt(session.endTime)}</span>
                              )}
                              <span className="text-xs font-medium">{session.durationHours != null ? `${session.durationHours.toFixed(1)}h` : "-"}</span>
                              {session.activity && <span className="truncate text-muted-foreground">— {session.activity}</span>}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}

            {data.logs.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium">Logs diários na janela</div>
                <ScrollArea className="max-h-60 rounded-md border p-2">
                  <ul className="text-sm space-y-3">
                    {groupByPerson(data.logs, displayMode).map((section) => (
                      <li key={section.key}>
                        {section.label && <div className="mb-1 font-medium text-muted-foreground">{section.label}</div>}
                        <ul className="space-y-1">
                          {section.items.map((log) => (
                            <li key={log.id} className="flex items-start gap-2">
                              {displayMode !== "grouped" && <Badge variant="outline">{log.userName ?? "?"}</Badge>}
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{logRange(log)}</span>
                              <span>{log.note}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        {data && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" asChild>
              <a href={`/api/project-reports/${data.report.id}/export.csv`}>
                <Download className="h-4 w-4 mr-2" /> Exportar CSV
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/dashboard/project-reports/${data.report.id}/print?auto=1`} target="_blank" rel="noreferrer">
                <Printer className="h-4 w-4 mr-2" /> Imprimir / PDF
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
