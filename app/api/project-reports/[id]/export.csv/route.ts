import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { reporting: reportingModule } = getBackendComposition()

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value)
  // aspas para conter ; e quebras de linha; dobra aspas internas
  return `"${text.replace(/"/g, '""')}"`
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const reportId = Number(params.id)
    if (!/^\d+$/.test(params.id) || reportId <= 0) {
      return new Response(JSON.stringify({ error: "id inválido" }), { status: 400 })
    }
    void request

    const aggregate = await reportingModule.aggregateProjectReport(auth.actor.id, auth.actor.roles, reportId)
    const { report, logs, sessions, totals } = aggregate

    const lines: string[] = []
    lines.push(`Relatório de projeto;${csvCell(report.title ?? "-")}`)
    lines.push(`Projeto;${csvCell(report.projectName)}`)
    lines.push(`Autor;${csvCell(report.authorName)}`)
    lines.push(`Periodicidade;${csvCell(report.periodLabel)}`)
    lines.push(`Janela;${csvCell(new Date(report.periodStart).toLocaleString("pt-BR"))} a ${csvCell(new Date(report.periodEnd).toLocaleString("pt-BR"))}`)
    lines.push("")
    lines.push("Conteudo")
    lines.push(csvCell(report.content))
    lines.push("")
    lines.push(`Sessoes (${totals.sessionCount});Horas totais;${totals.totalHours.toFixed(2)}`)
    lines.push(["Usuario", "Inicio", "Fim", "Horas", "Atividade", "Local"].map(csvCell).join(";"))
    for (const session of sessions) {
      lines.push(
        [
          session.userName,
          new Date(session.startTime).toLocaleString("pt-BR"),
          session.endTime ? new Date(session.endTime).toLocaleString("pt-BR") : "-",
          session.durationHours != null ? session.durationHours.toFixed(2) : "-",
          session.activity ?? "-",
          session.location ?? "-",
        ]
          .map(csvCell)
          .join(";"),
      )
    }
    lines.push("")
    lines.push(`Logs diarios (${totals.logCount})`)
    lines.push(["Usuario", "Data", "Nota"].map(csvCell).join(";"))
    for (const log of logs) {
      lines.push([log.userName ?? "-", new Date(log.date).toLocaleDateString("pt-BR"), log.note ?? "-"].map(csvCell).join(";"))
    }

    const csv = "\uFEFF" + lines.join("\n")
    const safeName = `relatorio-projeto-${report.id}.csv`
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: unknown) {
    console.error("Erro ao exportar relatório CSV:", error)
    const message = error instanceof Error ? error.message : "Erro ao exportar relatório CSV"
    const status = message.includes("Acesso negado") ? 403 : message.includes("não encontrado") ? 404 : 500
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  }
}
