"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { parseAsBoolean, parseAsInteger, parseAsString, useQueryState } from "nuqs"
import { ArrowRight, FolderKanban, ChevronDown } from "lucide-react"
import type { Task } from "@/entities/task"
import { projectStatusBadgeClass, projectStatusLabel, taskStatusChartColor, taskStatusSentenceLabel } from "@/components/ui/status"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { MiniDonutChart, WeeklyBarChart } from "@/components/ui/data-charts"
import { civilDayOfInstant } from "@/backend/domain"
import { projectProgress } from "@/features/projects/utils/project-progress"
import { filterBoardTasks } from "../utils/filter-board-tasks"

interface HomeOverviewProps {
  projects: Array<{ id: number; name: string; createdAt: string; status: string; startDate?: string | null; endDate?: string | null }>
  tasks: Task[]
  weekHours: number
  currentWeekHours: number
}

const TASK_STATUSES: Task["status"][] = ["to-do", "in-progress", "in-review", "adjust", "done"]

function formatHours(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)
}

function projectStatus(status: string) {
  if (status === "active" || status === "completed" || status === "archived") {
    return { className: projectStatusBadgeClass[status], label: projectStatusLabel[status] }
  }
  return { className: "bg-muted text-muted-foreground", label: status }
}

export function HomeOverview({ projects, tasks, weekHours, currentWeekHours }: HomeOverviewProps) {
  const [open, setOpen] = useState(true)
  const [projectId] = useQueryState("projeto", parseAsInteger)
  const [overdue] = useQueryState("atrasadas", parseAsBoolean.withDefault(false))
  const [dueToday] = useQueryState("hoje", parseAsBoolean.withDefault(false))
  const [search] = useQueryState("busca", parseAsString.withDefault(""))
  const [assigneeId] = useQueryState("pessoa", parseAsInteger)
  const [activityId] = useQueryState("atividade", parseAsInteger)
  const filters = { projectId, overdue, dueToday, search, assigneeId, activityId }
  const filteredTasks = useMemo(() => filterBoardTasks(tasks, filters), [
    tasks, projectId, overdue, dueToday, search, assigneeId, activityId,
  ])
  const hasTaskFilters = Boolean(projectId || overdue || dueToday || search || assigneeId || activityId)
  const visibleProjects = hasTaskFilters
    ? projects.filter(project => filteredTasks.some(task => task.projectId === project.id))
    : projects
  const recentProjects = [...visibleProjects]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id)
    .slice(0, 3)
  const taskCounts = Object.fromEntries(
    TASK_STATUSES.map((status) => [
      status,
      filteredTasks.filter((task) => task.status === status).length,
    ]),
  ) as Record<Task["status"], number>
  const completion = filteredTasks.length ? Math.round((taskCounts.done / filteredTasks.length) * 100) : 0
  const hoursProgress = weekHours > 0 ? Math.min(100, Math.round((currentWeekHours / weekHours) * 100)) : 0
  const today = civilDayOfInstant(new Date())
  const statusSegments = TASK_STATUSES.map((status) => ({ label: taskStatusSentenceLabel[status], value: taskCounts[status], color: taskStatusChartColor[status] }))
  const taskTotal = filteredTasks.length

  // Ritmo de conclusões nos últimos 7 dias civis. A chave de hoje vem de `civilDayOfInstant`
  // (fuso do laboratório) e os dias anteriores saem por subtração de calendário em UTC — a
  // mesma noção de dia civil, sem `new Date()` solto na aritmética (DEC-132).
  const lastSevenDays = useMemo(() => {
    const [y, m, d] = today.split("-").map(Number)
    const buckets: Array<{ weekStart: string; weekEnd: string; label: string; count: number }> = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date(Date.UTC(y, m - 1, d - i))
      const key = day.toISOString().slice(0, 10)
      const label = `${String(day.getUTCDate()).padStart(2, "0")}/${String(day.getUTCMonth() + 1).padStart(2, "0")}`
      const count = filteredTasks.filter((task) => task.completedAt && civilDayOfInstant(new Date(task.completedAt)) === key).length
      buckets.push({ weekStart: key, weekEnd: key, label, count })
    }
    return buckets
  }, [today, filteredTasks])

  return (
    <section aria-label="Resumo do laboratório" className="mb-5 rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <h2 className="text-sm font-semibold">Resumo do laboratório</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls="home-insights"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Ocultar" : "Mostrar"}
          <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden="true" />
        </Button>
      </div>

      {open && (
        <div id="home-insights" className="grid gap-5 p-4 pt-3 md:grid-cols-2 lg:grid-cols-3">
          <section aria-labelledby="home-recent-projects" className="min-w-0">
            <div className="mb-3 flex items-center gap-2"><FolderKanban className="h-4 w-4 text-primary" aria-hidden="true" /><h3 id="home-recent-projects" className="text-sm font-semibold">Projetos recentes</h3></div>
            <div className="space-y-3">
              {recentProjects.length ? recentProjects.map((project) => {
                const progress = projectProgress(project, filteredTasks, today)
                const status = projectStatus(project.status)
                return (
                  <Link
                    key={project.id}
                    href={`/dashboard/projetos/${project.id}`}
                    className="group block space-y-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium group-hover:text-primary">{project.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {progress.source === "time" ? "Andamento temporal" : progress.detail}
                        </p>
                      </div>
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                    </div>
                    <Progress value={progress.percent} aria-label={`Progresso de ${project.name}: ${progress.percent}%`} className="h-1.5" />
                  </Link>
                )
              }) : (
                <p className="py-2 text-sm text-muted-foreground">Nenhum projeto disponível.</p>
              )}
              <Link href="/dashboard/projetos" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Ver projetos <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </section>

          <section aria-labelledby="home-weekly-goal" className="min-w-0 md:border-l md:pl-5 lg:border-l lg:pl-5">
            <h3 id="home-weekly-goal" className="mb-3 text-sm font-semibold">Meta da semana</h3>
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3"><p className="text-sm font-medium">Carga horária</p><p className="text-sm font-semibold tabular-nums">{formatHours(currentWeekHours)}{weekHours > 0 ? ` / ${formatHours(weekHours)} h` : " h"}</p></div>
              <Progress aria-label={`Meta semanal de horas: ${hoursProgress}%`} value={hoursProgress} className="h-3" />
              <p className="mt-2 text-xs text-muted-foreground">{weekHours > 0 ? `${hoursProgress}% da meta semanal · horas registradas nesta semana` : "Defina sua meta no perfil"}</p>
            </div>
            <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">Tarefas concluídas <span className="float-right font-medium tabular-nums text-foreground">{taskCounts.done}</span></p>
          </section>

          <section aria-labelledby="home-task-chart" className="min-w-0 md:col-span-2 md:border-l md:pl-5 lg:col-span-1 lg:border-l lg:pl-5">
            <h3 id="home-task-chart" className="mb-3 text-sm font-semibold">Estatísticas do quadro</h3>
            <div className="flex items-center gap-4">
              <MiniDonutChart label={`Conclusão de tarefas: ${completion}% (${taskCounts.done} de ${taskTotal})`} centerValue={`${completion}%`} centerLabel="concluídas" segments={[{ label: taskStatusSentenceLabel.done, value: taskCounts.done, color: taskStatusChartColor.done }, { label: "Restantes", value: Math.max(0, taskTotal - taskCounts.done), color: "hsl(var(--muted))" }]} size={80} />
              <div className="min-w-0 flex-1">
                <p className="mb-1.5 text-xs font-medium">Concluídas nos últimos 7 dias</p>
                <WeeklyBarChart weeks={lastSevenDays} label="Tarefas concluídas nos últimos 7 dias" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
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
          </section>
        </div>
      )}
    </section>
  )
}
