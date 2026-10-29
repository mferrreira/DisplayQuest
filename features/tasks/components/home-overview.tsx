"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { parseAsBoolean, parseAsInteger, parseAsString, useQueryState } from "nuqs"
import { ArrowRight, FolderKanban, ChevronDown } from "lucide-react"
import type { Task } from "@/entities/task"
import { projectStatusBadgeClass, projectStatusLabel, taskStatusChartColor, taskStatusSentenceLabel } from "@/components/ui/status"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { StackedBarChart } from "@/components/ui/data-charts"
import { clientStorageKey, readJson, writeJson } from "@/lib/client-storage"
import { isTaskOverdue } from "../utils/move-rules"
import { civilDayOfInstant } from "@/backend/domain"
import { projectProgress } from "@/features/projects/utils/project-progress"
import { filterBoardTasks } from "../utils/filter-board-tasks"
import { ActivityFeed } from "./activity-feed"

interface HomeOverviewProps {
  projects: Array<{ id: number; name: string; createdAt: string; status: string; startDate?: string | null; endDate?: string | null }>
  tasks: Task[]
}

const TASK_STATUSES: Task["status"][] = ["to-do", "in-progress", "in-review", "adjust", "done"]

// V6-11m (dono): a preferencia de abrir/fechar a faixa sobrevive a voltar pra Home — senao a
// pessoa fecha a faixa e ela reabre sozinha a cada visita. Chave no namespace `dq:` da casa.
const OVERVIEW_OPEN_KEY = clientStorageKey("home", "resumo-aberto")

function projectStatus(status: string) {
  if (status === "active" || status === "completed" || status === "archived") {
    return { className: projectStatusBadgeClass[status], label: projectStatusLabel[status] }
  }
  return { className: "bg-muted text-muted-foreground", label: status }
}

export function HomeOverview({ projects, tasks }: HomeOverviewProps) {
  const [open, setOpen] = useState(true)
  // O SSR sempre renderiza aberta (o storage nao existe la); a preferencia entra no primeiro
  // efeito no cliente — sem isso, o HTML do servidor e o primeiro render divergiriam (hydration).
  useEffect(() => {
    setOpen(readJson<boolean>(OVERVIEW_OPEN_KEY, true))
  }, [])
  const toggleOpen = () => {
    const next = !open
    setOpen(next)
    writeJson(OVERVIEW_OPEN_KEY, next)
  }
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
  const today = civilDayOfInstant(new Date())
  const statusSegments = TASK_STATUSES.map((status) => ({ label: taskStatusSentenceLabel[status], value: taskCounts[status], color: taskStatusChartColor[status] }))
  const taskTotal = filteredTasks.length
  // Atrasadas é a MESMA regra do filtro do quadro (`isTaskOverdue`), para o número da home
  // conferir com a contagem do filtro "Somente atrasadas" em qualquer estado da tarefa.
  const overdueCount = filteredTasks.filter((task) => isTaskOverdue(task)).length

  return (
    <section aria-label="Resumo do laboratório" className="mb-5 rounded-lg border bg-card">
      {/* Fechada, a faixa é só o cabeçalho: o `py-3` dá o mesmo respiro embaixo que o conteúdo
          aberto daria — sem ele o título e o botão ficam colados no topo ("torto pra baixo"). */}
      <div className={`flex items-center justify-between gap-3 px-4 ${open ? "pt-3" : "py-3"}`}>
        <h2 className="text-sm font-semibold">Resumo do laboratório</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls="home-insights"
          onClick={toggleOpen}
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

          <section aria-labelledby="home-status-bar" className="min-w-0 md:border-l md:pl-5 lg:border-l lg:pl-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 id="home-status-bar" className="text-sm font-semibold">Tarefas por status</h3>
              <span className="text-xs text-muted-foreground">{taskTotal} no total</span>
            </div>
            <StackedBarChart label={`Distribuição das tarefas por status`} segments={statusSegments} className="h-3.5" />
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
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
              <span>{completion}% das tarefas concluídas</span>
              {overdueCount > 0 && <span className="font-medium text-warning">{overdueCount} atrasada{overdueCount === 1 ? "" : "s"}</span>}
            </p>
          </section>

          <section className="min-w-0 md:col-span-2 md:border-l md:pl-5 lg:col-span-1 lg:border-l lg:pl-5">
            {/* O feed "Atividade recente" saiu de baixo do quadro para este bloco (dono, 2026-10-29):
                o gráfico "Atividade da semana" foi para baixo do quadro. O recorte do feed obedece ao
                MESMO `?projeto=` que o quadro usa — `projectId` aqui é a mesma fonte de verdade da URL.
                A `region` "Atividade recente" é a `<section>` do próprio ActivityFeed, não este wrapper. */}
            <ActivityFeed projectId={projectId} />
          </section>
        </div>
      )}
    </section>
  )
}
