"use client"

import { Button } from "@/components/ui/button"
import { MiniDonutChart } from "@/components/ui/data-charts"
import { activityStatusChartColor } from "@/components/ui/status"
import { ACTIVITY_STATUS_LABELS, civilDayOfInstant, monthColumnLabel } from "@/backend/domain"
import {
  activityMonthCounts,
  activityStatusCounts,
  chartActivityWindow,
  overdueActivityLines,
  OVERDUE_LINE_LIMIT,
  type ActivityChartRow,
} from "@/features/projects/utils/activity-chart-rules"

/**
 * plan-v23 S05 (DEC-269): a coluna de gráficos da tela Projetos.
 *
 * Os três cards de atividade de plan-v13 (status, mês, atrasadas) voltam numa coluna
 * fixa à direita da lista. O recorte é o da página (busca, status e pessoa) — a coluna
 * não tem seletor próprio. A regra de calendário é a do domínio (DEC-151 janela,
 * DEC-64 atraso, DEC-132 rótulo de mês); a peça só agrega para a tela.
 *
 * A leitura em falha diz `role="alert"` com retry — regra da casa: estado vazio não
 * pode fingir que não havia nada a carregar.
 */
export interface ProjectActivityChartsProps {
  projects: ReadonlyArray<{ id: number; name: string }>
  activities: readonly ActivityChartRow[]
  status: "loading" | "ready" | "error"
  onRetry: () => void
}

export function ProjectActivityCharts({ projects, activities, status, onRetry }: ProjectActivityChartsProps) {
  const visibleProjectIds = new Set(projects.map(project => project.id))
  const scopedActivities = activities.filter(row => visibleProjectIds.has(row.projectId))
  const today = civilDayOfInstant(new Date())

  const statusCounts = activityStatusCounts(scopedActivities)
  const months = chartActivityWindow(scopedActivities, today)
  const monthCounts = activityMonthCounts(scopedActivities, months)
  const maxMonth = Math.max(1, ...monthCounts.map(c => c.done + c.pending))
  const overdue = overdueActivityLines(scopedActivities, new Map(projects.map(p => [p.id, p.name])), today)

  return (
    <section aria-label="Gráficos do cronograma" className="rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Gráficos do cronograma</h2>

      {status === "loading" && <p className="mt-3 text-sm text-muted-foreground">Carregando os gráficos do cronograma.</p>}

      {status === "error" && (
        <div role="alert" className="mt-3 flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">Não foi possível carregar os gráficos do cronograma.</p>
          <Button size="sm" variant="outline" onClick={onRetry}>Tentar de novo</Button>
        </div>
      )}

      {status === "ready" && (
        <div className="mt-3 space-y-4">
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-semibold">Atividades por status</h3>
            <div className="mt-3 flex items-center gap-4">
              <MiniDonutChart
                label="Atividades do cronograma por status"
                centerValue={scopedActivities.length}
                centerLabel="atividades"
                segments={statusCounts.map(c => ({ label: ACTIVITY_STATUS_LABELS[c.status], value: c.count, color: activityStatusChartColor[c.status] }))}
                size={100}
              />
              <div className="min-w-0 flex-1 space-y-2 text-xs">
                {statusCounts.map(c => (
                  <div key={c.status} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activityStatusChartColor[c.status] }} />{ACTIVITY_STATUS_LABELS[c.status]}</span>
                    <span className="font-medium tabular-nums">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-semibold">Atividades por mês</h3>
            {months.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">Nenhuma atividade no recorte.</p> : (
              <div className="mt-3 space-y-1.5">
                {monthCounts.map(c => (
                  <div key={c.month} data-month-row className="flex items-center gap-2 text-xs">
                    <span data-month-label className="w-14 shrink-0 tabular-nums text-muted-foreground">{monthColumnLabel(c.month)}</span>
                    <span className="flex h-3 w-full overflow-hidden rounded-sm bg-muted" aria-hidden="true">
                      <span className="block h-full" style={{ width: `${(c.done / maxMonth) * 100}%`, backgroundColor: "hsl(var(--success))" }} />
                      <span className="block h-full" style={{ width: `${(c.pending / maxMonth) * 100}%`, backgroundColor: "hsl(var(--info))" }} />
                    </span>
                    <span data-month-count className="w-8 shrink-0 text-right font-medium tabular-nums">{c.done + c.pending}</span>
                  </div>
                ))}
                <p className="pt-1 text-xs text-muted-foreground">Concluída e pendente por mês do recorte.</p>
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-semibold">Atividades atrasadas</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              {overdue.length === 0 ? "Nenhuma atividade vencida neste recorte." : `${overdue.length} vencida${overdue.length === 1 ? "a" : "s"}`}
              {overdue.length > OVERDUE_LINE_LIMIT ? ` · mostrando as ${OVERDUE_LINE_LIMIT} primeiras` : ""}
            </p>
            {overdue.length > 0 &&
              <ul className="mt-3 space-y-2">
                {overdue.map(line => (
                  <li key={line.id} data-overdue-line className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate"><span className="font-medium">{line.projectName}</span> — {line.description}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">até {line.periodoFim.slice(8)}/{line.periodoFim.slice(5, 7)}</span>
                  </li>
                ))}
              </ul>}
          </div>
        </div>
      )}
    </section>
  )
}
