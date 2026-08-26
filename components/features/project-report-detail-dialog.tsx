"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Download, Loader2, Paperclip, Printer } from "lucide-react"

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
  logs: Array<{ id: number; userName: string | null; date: string; note: string | null }>
  sessions: Array<{ id: number; userName: string; startTime: string; durationHours: number | null; activity: string | null }>
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
                      <a href={`/${attachment.storedPath}`} target="_blank" rel="noreferrer" className="truncate underline-offset-2 hover:underline">
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
                <ScrollArea className="max-h-40 rounded-md border p-2">
                  <ul className="text-sm space-y-1">
                    {data.sessions.map((session) => (
                      <li key={session.id} className="flex items-center gap-2">
                        <Badge variant="outline">{session.userName}</Badge>
                        <span className="text-xs text-muted-foreground">{fmt(session.startTime)}</span>
                        <span className="text-xs font-medium">{session.durationHours != null ? `${session.durationHours.toFixed(1)}h` : "-"}</span>
                        {session.activity && <span className="truncate text-muted-foreground">— {session.activity}</span>}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}

            {data.logs.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium">Logs diários na janela</div>
                <ScrollArea className="max-h-40 rounded-md border p-2">
                  <ul className="text-sm space-y-1">
                    {data.logs.map((log) => (
                      <li key={log.id}>
                        <Badge variant="outline">{log.userName ?? "?"}</Badge>{" "}
                        <span className="text-xs text-muted-foreground">{fmt(log.date)}</span>{" "}
                        {log.note}
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
