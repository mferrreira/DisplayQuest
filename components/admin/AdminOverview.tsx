"use client"

/**
 * V6-12 — Visão Geral do painel administrativo, no estilo das telas de Projetos/Home.
 *
 * Saiu dos quatro retângulos de métrica (um deles só para "pontos totais / média", inútil) e
 * do progresso "75%" fixo no código. Entra em gráficos com o dado que o painel já carrega:
 * quem está no laboratório agora (sessões), tarefas por status, ritmo de conclusões nos
 * últimos 7 dias, projetos com progresso REAL (`projectProgress`) e um placar top 5 com
 * métrica trocável (pontos, tarefas, projetos ou horas).
 */
import { useState } from "react"
import { civilDayOfInstant, MAX_STRETCH_SEC } from "@/backend/domain"
import type { Project } from "@/contexts/types"
import {
  projectStatusChartColor,
  projectStatusLabel,
  taskStatusChartColor,
  taskStatusSentenceLabel,
} from "@/components/ui/status"
import { MiniDonutChart, StackedBarChart, WeeklyBarChart } from "@/components/ui/data-charts"
import { projectProgress } from "@/features/projects/utils/project-progress"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Activity, Target, Trophy, Users } from "lucide-react"

const TASK_STATUSES = ["to-do", "in-progress", "in-review", "adjust", "done"] as const

interface AdminOverviewProps {
  users: Array<{
    id: number
    name: string
    points?: number
    completedTasks?: number
    status?: string
    roles?: string[]
  }>
  projects: Array<{
    id: number
    name: string
    status: string
    startDate?: string | null
    endDate?: string | null
    createdBy?: number
    leaderId?: number | null
    members?: Array<{ userId: number }>
  }>
  tasks: Array<{ id: number; status: string; projectId?: number | null; completedAt?: string | Date | null }>
  sessions: Array<{
    id: number
    userId: number
    status: string
    startTime: string | Date
    duration?: number | null
  }>
  onManageSessions: () => void
}

type ProductivityMetric = "points" | "tasks" | "projects" | "hours"

// V8-2 (DEC-212): o placar de pontos é MENSAL — o mês fecha com snapshot e a coluna volta a 0
// (plan-v8 MODELO §3). O rótulo diz isso; as colunas novas do ranking (Elo, Troféus, Moedas) são V8-7.
const PRODUCTIVITY_METRICS: Array<{ id: ProductivityMetric; label: string }> = [
  { id: "points", label: "Pontos do mês" },
  { id: "tasks", label: "Tarefas" },
  { id: "projects", label: "Projetos" },
  { id: "hours", label: "Horas" },
]

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()
}

function formatMetric(value: number, metric: ProductivityMetric) {
  if (metric === "hours") {
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)} h`
  }
  if (metric === "points") return `${value} pts`
  if (metric === "projects") return `${value} projeto${value === 1 ? "" : "s"}`
  return `${value} tarefa${value === 1 ? "" : "s"}`
}

/**
 * Mesma conta do cronômetro (`getElapsedSeconds` do WorkSessionsProvider): `duration` já
 * acumula os trechos pausados, e a sessão ativa soma o trecho corrente com o teto anti-farm.
 */
function sessionSeconds(
  session: AdminOverviewProps["sessions"][number],
  nowMs: number,
) {
  const accumulated = typeof session.duration === "number" ? session.duration : 0
  if (session.status !== "active") return accumulated
  const start = new Date(session.startTime).getTime()
  const running = Math.min(MAX_STRETCH_SEC, Math.max(0, (nowMs - start) / 1000))
  return accumulated + running
}

export function AdminOverview({ users, projects, tasks, sessions, onManageSessions }: AdminOverviewProps) {
  const today = civilDayOfInstant(new Date())

  const openSessions = sessions.filter((s) => s.status === "active" || s.status === "paused")

  const taskCounts = Object.fromEntries(
    TASK_STATUSES.map((status) => [status, tasks.filter((t) => t.status === status).length]),
  ) as Record<(typeof TASK_STATUSES)[number], number>
  const taskTotal = tasks.length
  const completion = taskTotal ? Math.round((taskCounts.done / taskTotal) * 100) : 0
  // Lengenda em caixa de frase (review V6-11 #12): CAIXA ALTA é o registro do badge.
  const statusSegments = TASK_STATUSES.map((status) => ({
    label: taskStatusSentenceLabel[status],
    value: taskCounts[status],
    color: taskStatusChartColor[status],
  }))

  const lastSevenDays = (() => {
    const [y, m, d] = today.split("-").map(Number)
    const buckets: Array<{ weekStart: string; weekEnd: string; label: string; count: number }> = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date(Date.UTC(y, m - 1, d - i))
      const key = day.toISOString().slice(0, 10)
      const label = `${String(day.getUTCDate()).padStart(2, "0")}/${String(day.getUTCMonth() + 1).padStart(2, "0")}`
      const count = tasks.filter((t) => t.completedAt && civilDayOfInstant(new Date(t.completedAt as string | Date)) === key).length
      buckets.push({ weekStart: key, weekEnd: key, label, count })
    }
    return buckets
  })()

  const projectStatusCounts = projects.reduce<Record<string, number>>((acc, project) => {
    acc[project.status] = (acc[project.status] ?? 0) + 1
    return acc
  }, {})
  const projectSegments = Object.entries(projectStatusCounts).map(([status, value]) => ({
    label: projectStatusLabel[status as Project["status"]] ?? status,
    value,
    color: projectStatusChartColor[status as Project["status"]] ?? "hsl(var(--muted))",
  }))
  const activeProjects = projects.filter((p) => p.status === "active")

  // Destaques de produtividade (dono, 2026-10-21): pontos sozinhos repetiam o quadro de
  // liderança. O mesmo placar agora mostra quatro leituras — pontos, tarefas concluídas,
  // projetos de que a pessoa participa e horas de sessão — e a métrica escolhida ordena.
  const [productivityMetric, setProductivityMetric] = useState<ProductivityMetric>("points")
  const nowMs = Date.now()
  const productivity = users.map((user) => {
    const projectCount = projects.filter(
      (project) =>
        project.leaderId === user.id ||
        project.createdBy === user.id ||
        project.members?.some((member) => member.userId === user.id),
    ).length
    const seconds = sessions
      .filter((session) => session.userId === user.id)
      .reduce((sum, session) => sum + sessionSeconds(session, nowMs), 0)
    return {
      id: user.id,
      name: user.name,
      points: user.points ?? 0,
      tasks: user.completedTasks ?? 0,
      projects: projectCount,
      hours: seconds / 3600,
    }
  })
  const leaderboard = [...productivity]
    .sort(
      (a, b) =>
        b[productivityMetric] - a[productivityMetric] ||
        b.points - a.points ||
        a.name.localeCompare(b.name, "pt-BR"),
    )
    .slice(0, 5)
  const maxMetric = Math.max(1, ...leaderboard.map((person) => Math.max(0, person[productivityMetric])))

  return (
    <div className="space-y-5">
      <div className="grid gap-5 rounded-lg border bg-card p-4 md:grid-cols-3">
        <section aria-labelledby="admin-live" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 id="admin-live" className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" aria-hidden="true" /> No laboratório agora
            </h3>
            <Button size="sm" variant="outline" onClick={onManageSessions}>Gerenciar</Button>
          </div>
          {openSessions.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Nenhuma sessão ativa ou pausada.</p>
          ) : (
            <ul className="max-h-44 space-y-2.5 overflow-y-auto pr-1">
              {openSessions.map((session) => {
                const user = users.find((u) => u.id === session.userId)
                if (!user) return null
                return (
                  <li key={session.id} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info/15 text-xs font-medium text-info">
                        {initials(user.name)}
                      </span>
                      <span className="min-w-0 truncate text-sm font-medium">{user.name}</span>
                    </div>
                    <Badge variant="outline" className={session.status === "paused" ? "bg-warning/10 text-warning border-warning/25" : "bg-success/10 text-success border-success/25"}>
                      {session.status === "paused" ? "Pausada" : "Trabalhando"}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="admin-task-status" className="min-w-0 md:border-l md:pl-5">
          <h3 id="admin-task-status" className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-primary" aria-hidden="true" /> Tarefas por status
          </h3>
          <div className="flex items-center gap-4">
            <MiniDonutChart
              label={`Conclusão de tarefas: ${completion}% (${taskCounts.done} de ${taskTotal})`}
              centerValue={`${completion}%`}
              centerLabel="concluídas"
              segments={[
                { label: taskStatusSentenceLabel.done, value: taskCounts.done, color: taskStatusChartColor.done },
                { label: "Restantes", value: Math.max(0, taskTotal - taskCounts.done), color: "hsl(var(--muted))" },
              ]}
              size={80}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <StackedBarChart label="Distribuição de tarefas por status" segments={statusSegments} />
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {statusSegments.map((segment) => (
                  <div key={segment.label} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                      {segment.label}
                    </span>
                    <span className="font-medium tabular-nums">{segment.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="admin-rhythm" className="min-w-0 md:border-l md:pl-5">
          <h3 id="admin-rhythm" className="mb-3 text-sm font-semibold">Concluídas nos últimos 7 dias</h3>
          <WeeklyBarChart weeks={lastSevenDays} label="Tarefas concluídas nos últimos 7 dias" />
        </section>
      </div>

      <div className="grid gap-5 rounded-lg border bg-card p-4 lg:grid-cols-3">
        <section aria-labelledby="admin-projects" className="min-w-0 lg:col-span-2">
          <h3 id="admin-projects" className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-primary" aria-hidden="true" /> Projetos ativos
          </h3>
          {activeProjects.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Nenhum projeto ativo.</p>
          ) : (
            <div className="space-y-3">
              {activeProjects.map((project) => {
                const progress = projectProgress(project, tasks, today)
                return (
                  <div key={project.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium">{project.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{progress.detail}</span>
                    </div>
                    <Progress value={progress.percent} aria-label={`Progresso de ${project.name}: ${progress.percent}%`} className="h-1.5" />
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-4 flex items-center gap-4 border-t pt-4">
            <MiniDonutChart
              label={`Projetos: ${projects.length} no total`}
              centerValue={projects.length}
              centerLabel="projetos"
              segments={projectSegments}
              size={72}
            />
            <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {projectSegments.map((segment) => (
                <div key={segment.label} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                    {segment.label}
                  </span>
                  <span className="font-medium tabular-nums">{segment.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="admin-leaderboard" className="min-w-0 lg:border-l lg:pl-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 id="admin-leaderboard" className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-primary" aria-hidden="true" /> Top 5 em produtividade
            </h3>
            <div role="group" aria-label="Métrica do ranking" className="flex flex-wrap gap-1">
              {PRODUCTIVITY_METRICS.map((metric) => (
                <Button
                  key={metric.id}
                  type="button"
                  size="sm"
                  variant={productivityMetric === metric.id ? "default" : "outline"}
                  aria-pressed={productivityMetric === metric.id}
                  className="h-7 px-2 text-xs"
                  onClick={() => setProductivityMetric(metric.id)}
                >
                  {metric.label}
                </Button>
              ))}
            </div>
          </div>
          {leaderboard.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Sem pessoas cadastradas.</p>
          ) : (
            <ol className="space-y-3">
              {leaderboard.map((person, index) => (
                <li key={person.id} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info/15 text-[11px] font-medium text-info">
                    {initials(person.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{person.name}</span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums">
                        {formatMetric(person[productivityMetric], productivityMetric)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.round((Math.max(0, person[productivityMetric]) / maxMetric) * 100))}%` }} />
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {PRODUCTIVITY_METRICS.filter((metric) => metric.id !== productivityMetric)
                        .map((metric) => formatMetric(person[metric.id], metric.id))
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
