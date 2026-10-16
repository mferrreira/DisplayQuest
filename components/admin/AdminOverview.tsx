"use client"

/**
 * V6-12 — Visão Geral do painel administrativo, no estilo das telas de Projetos/Home.
 *
 * Saiu dos quatro retângulos de métrica (um deles só para "pontos totais / média", inútil) e
 * do progresso "75%" fixo no código. Entra em gráficos com o dado que o painel já carrega:
 * quem está no laboratório agora (sessões), tarefas por status, ritmo de conclusões nos
 * últimos 7 dias, projetos com progresso REAL (`projectProgress`) e um placar top 5 por pontos.
 */
import { civilDayOfInstant } from "@/backend/domain"
import {
  taskStatusChartColor,
  taskStatusLabel,
} from "@/components/ui/status"
import { MiniDonutChart, StackedBarChart, WeeklyBarChart } from "@/components/ui/data-charts"
import { projectProgress } from "@/features/projects/utils/project-progress"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Activity, Target, Trophy, Users } from "lucide-react"

const TASK_STATUSES = ["to-do", "in-progress", "in-review", "adjust", "done"] as const

const PROJECT_STATUS_META: Record<string, { label: string; color: string }> = {
  active: { label: "Ativo", color: "hsl(var(--success))" },
  on_hold: { label: "Em pausa", color: "hsl(var(--warning))" },
  completed: { label: "Concluído", color: "hsl(var(--info))" },
  archived: { label: "Arquivado", color: "hsl(var(--muted-foreground))" },
}

interface AdminOverviewProps {
  users: Array<{ id: number; name: string; points?: number; status?: string; roles?: string[] }>
  projects: Array<{ id: number; name: string; status: string; startDate?: string | null; endDate?: string | null }>
  tasks: Array<{ id: number; status: string; projectId?: number | null; completedAt?: string | Date | null }>
  sessions: Array<{ id: number; userId: number; status: string; startTime: string | Date }>
  onManageSessions: () => void
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()
}

export function AdminOverview({ users, projects, tasks, sessions, onManageSessions }: AdminOverviewProps) {
  const today = civilDayOfInstant(new Date())

  const openSessions = sessions.filter((s) => s.status === "active" || s.status === "paused")

  const taskCounts = Object.fromEntries(
    TASK_STATUSES.map((status) => [status, tasks.filter((t) => t.status === status).length]),
  ) as Record<(typeof TASK_STATUSES)[number], number>
  const taskTotal = tasks.length
  const completion = taskTotal ? Math.round((taskCounts.done / taskTotal) * 100) : 0
  const statusSegments = TASK_STATUSES.map((status) => ({
    label: taskStatusLabel[status],
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
    label: PROJECT_STATUS_META[status]?.label ?? status,
    value,
    color: PROJECT_STATUS_META[status]?.color ?? "hsl(var(--muted))",
  }))
  const activeProjects = projects.filter((p) => p.status === "active")

  const leaderboard = [...users]
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 5)
  const maxPoints = Math.max(1, ...leaderboard.map((u) => Math.max(0, u.points ?? 0)))

  return (
    <div className="space-y-5">
      <div className="grid gap-5 rounded-lg border bg-card/40 p-4 md:grid-cols-3">
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
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-xs font-medium text-success">
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
                { label: taskStatusLabel.done, value: taskCounts.done, color: taskStatusChartColor.done },
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

      <div className="grid gap-5 rounded-lg border bg-card/40 p-4 lg:grid-cols-3">
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
          <h3 id="admin-leaderboard" className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Trophy className="h-4 w-4 text-primary" aria-hidden="true" /> Top 5 em pontos
          </h3>
          {leaderboard.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Sem pessoas cadastradas.</p>
          ) : (
            <ol className="space-y-2.5">
              {leaderboard.map((user, index) => (
                <li key={user.id} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info/15 text-[11px] font-medium text-info">
                    {initials(user.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{user.name}</span>
                      <span className="text-xs font-semibold tabular-nums">{user.points ?? 0} pts</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.round((Math.max(0, user.points ?? 0) / maxPoints) * 100))}%` }} />
                    </div>
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
