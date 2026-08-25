"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

interface AggregateData {
  report: {
    id: number
    projectName: string
    authorName: string
    periodLabel: string
    periodStart: string
    periodEnd: string
    title: string | null
    content: string
  }
  logs: Array<{ id: number; userName: string | null; date: string; note: string | null }>
  sessions: Array<{
    id: number
    userName: string
    startTime: string
    endTime: string | null
    durationHours: number | null
    activity: string | null
    location: string | null
  }>
  totals: { logCount: number; sessionCount: number; totalHours: number }
}

export default function ProjectReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const searchParams = useSearchParams()
  const reportId = Number((params as any)?.id ?? "")
  const validId = /^\d+$/.test(String(reportId)) && Number(reportId) > 0 ? Number(reportId) : null

  const [data, setData] = useState<AggregateData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!validId) return
    let cancelled = false
    fetch(`/api/project-reports/${validId}/aggregate`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`)
        return json as AggregateData
      })
      .then((json) => { if (!cancelled) setData(json) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar") })
    return () => { cancelled = true }
  }, [validId])

  const auto = searchParams.get("auto") === "1"
  useEffect(() => {
    if (auto && data && !error) {
      const timer = setTimeout(() => window.print(), 600)
      return () => clearTimeout(timer)
    }
  }, [auto, data, error])

  if (error) {
    return <div className="p-8 text-sm text-destructive">{error}</div>
  }
  if (!data) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"

  return (
    <div className="mx-auto max-w-3xl p-8 print:p-0">
      <div className="print:hidden mb-6 flex justify-end gap-2">
        <Button onClick={() => window.print()}>Imprimir / Salvar PDF</Button>
      </div>

      <header className="border-b pb-4 mb-6">
        <h1 className="text-2xl font-bold">{data.report.title || `Relatório — ${data.report.projectName}`}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Projeto: {data.report.projectName} · Período: {data.report.periodLabel} · Autor: {data.report.authorName}
        </p>
        <p className="text-xs text-muted-foreground">
          Janela de {fmt(data.report.periodStart)} a {fmt(data.report.periodEnd)} · Emitido em{" "}
          {new Date().toLocaleString("pt-BR")}
        </p>
      </header>

      <section className="mb-8">
        <h2 className="font-semibold mb-2">O que foi feito</h2>
        <p className="whitespace-pre-wrap text-sm leading-6">{data.report.content}</p>
      </section>

      <section className="mb-8">
        <h2 className="font-semibold mb-2">Sessões ({data.totals.sessionCount}) · Total: {data.totals.totalHours.toFixed(1)}h</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1">Usuário</th>
              <th className="text-left py-1">Início</th>
              <th className="text-left py-1">Fim</th>
              <th className="text-right py-1">Horas</th>
              <th className="text-left py-1">Atividade</th>
            </tr>
          </thead>
          <tbody>
            {data.sessions.map((session) => (
              <tr key={session.id} className="border-b align-top">
                <td className="py-1 pr-2">{session.userName}</td>
                <td className="py-1 pr-2">{fmt(session.startTime)}</td>
                <td className="py-1 pr-2">{fmt(session.endTime)}</td>
                <td className="py-1 pr-2 text-right">{session.durationHours != null ? session.durationHours.toFixed(2) : "-"}</td>
                <td className="py-1">{session.activity ?? "-"}</td>
              </tr>
            ))}
            {data.sessions.length === 0 && (
              <tr><td colSpan={5} className="py-2 text-muted-foreground">Nenhuma sessão na janela.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Logs diários ({data.totals.logCount})</h2>
        <ul className="text-sm space-y-1">
          {data.logs.map((log) => (
            <li key={log.id}>
              <strong>{log.userName ?? "?"}</strong> · {fmt(log.date)} — {log.note ?? "-"}
            </li>
          ))}
          {data.logs.length === 0 && <li className="text-muted-foreground">Nenhum log na janela.</li>}
        </ul>
      </section>
    </div>
  )
}
