"use client"

import { useEffect, useState } from "react"
import { ChevronDown, EyeOff, ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { MiniDonutChart } from "@/components/ui/data-charts"
import { activityStatusChartColor, projectStatusLabel } from "@/components/ui/status"
import {
  ACTIVITY_STATUS_LABELS,
  civilDayOfInstant,
  monthColumnLabel,
} from "@/backend/domain"
import { clientStorageKey, readJson, writeJson } from "@/lib/client-storage"
import { projectProgress } from "@/features/projects/utils/project-progress"
import { ProjectLeaderboard } from "@/components/features/project-leaderboard"
import {
  activityMonthCounts,
  activityStatusCounts,
  chartActivityWindow,
  overdueActivityLines,
  OVERDUE_LINE_LIMIT,
} from "@/features/projects/utils/activity-chart-rules"
import type { ActivityChartRow } from "@/features/projects/utils/activity-chart-rules"
import type { Project, Task } from "@/contexts/types"

interface ProjectManagerDashboardProps {
  projects: Project[]
  tasks: Task[]
  /** plan-v13 S04/S05: as atividades agregadas de `GET /api/projects/cronograma`. */
  activities: ActivityChartRow[]
  scopeDescription?: string
  onProjectSelect?: (project: Project) => void
}

// S05 (regra 5): a preferência de fechar a linha de gráficos sobrevive à visita, no mesmo
// padrão da Home. A linha NASCE FECHADA (dono: foco no leaderboard) — ao contrário da Home,
// que nasce aberta. Chave no namespace `dq:` da casa.
const CHARTS_OPEN_KEY = clientStorageKey("projetos-graficos-aberto")

export function ProjectManagerDashboard({ projects, tasks, activities, scopeDescription, onProjectSelect }: ProjectManagerDashboardProps) {
  const [selectedProjectId, setSelectedProjectId] = useState("all")
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (selectedProjectId !== "all" && !projects.some(project => String(project.id) === selectedProjectId)) {
      setSelectedProjectId("all")
    }
  }, [projects, selectedProjectId])
  // O SSR sempre renderiza fechada (o storage não existe lá); a preferência entra no primeiro
  // efeito no cliente — sem isso, o HTML do servidor e o primeiro render divergiriam.
  useEffect(() => {
    setOpen(readJson<boolean>(CHARTS_OPEN_KEY, false))
  }, [])
  const toggleOpen = () => {
    const next = !open
    setOpen(next)
    writeJson(CHARTS_OPEN_KEY, next)
  }

  const selectedProject = selectedProjectId === "all" ? null : projects.find(project => String(project.id) === selectedProjectId) ?? null
  const scopedProjects = selectedProject ? [selectedProject] : projects
  const visibleProjectIds = new Set(scopedProjects.map(project => project.id))
  const scopedActivities = activities.filter(row => visibleProjectIds.has(row.projectId))
  const today = civilDayOfInstant(new Date())
  const scopeLabel = selectedProject ? `Projeto: ${selectedProject.name}` : scopeDescription || "Todos os projetos"

  const statusCounts = activityStatusCounts(scopedActivities)
  const months = chartActivityWindow(scopedActivities, today)
  const monthCounts = activityMonthCounts(scopedActivities, months)
  const maxMonth = Math.max(1, ...monthCounts.map(c => c.done + c.pending))
  const overdue = overdueActivityLines(scopedActivities, new Map(scopedProjects.map(p => [p.id, p.name])), today)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Estatísticas para <span className="font-medium text-foreground">{scopeLabel}</span></p>
        <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Projeto</span><select aria-label="Selecionar projeto para estatísticas" value={selectedProjectId} onChange={event => setSelectedProjectId(event.target.value)} className="h-9 max-w-[min(18rem,65vw)] rounded-md border bg-background px-3 text-sm"><option value="all">Todos os projetos</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      </div>

      {/* S05: uma linha colapsável — fechada, só o cabeçalho; aberta, os três cards de
          atividade (regra 4), na ordem do MODELO. Mesma aria-pattern da Home. */}
      <section aria-label="Gráficos do cronograma" className="rounded-lg border">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-sm font-semibold">Gráficos do cronograma</h2>
          <Button variant="ghost" size="sm" aria-expanded={open} aria-controls="projetos-graficos" onClick={toggleOpen}>
            {open ? <EyeOff className="mr-1 h-4 w-4" aria-hidden="true" /> : <ChevronDown className="mr-1 h-4 w-4" aria-hidden="true" />}
            {open ? "Ocultar" : "Mostrar"}
          </Button>
        </div>
        {open &&
          <div id="projetos-graficos" className="grid gap-4 border-t px-4 py-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-semibold">Atividades por status</h3>
              <div className="mt-3 flex items-center gap-4">
                <MiniDonutChart
                  label={`${scopeLabel}. Atividades do cronograma por status`}
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
                    <div key={c.month} className="flex items-center gap-2 text-xs">
                      <span className="w-14 shrink-0 tabular-nums text-muted-foreground">{monthColumnLabel(c.month)}</span>
                      <span className="flex h-3 w-full overflow-hidden rounded-sm bg-muted" aria-hidden="true">
                        <span className="block h-full" style={{ width: `${(c.done / maxMonth) * 100}%`, backgroundColor: "hsl(var(--success))" }} />
                        <span className="block h-full" style={{ width: `${(c.pending / maxMonth) * 100}%`, backgroundColor: "hsl(var(--info))" }} />
                      </span>
                      <span className="w-8 shrink-0 text-right font-medium tabular-nums">{c.done + c.pending}</span>
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
          </div>}
      </section>

      {/* S06 (regra 6): leaderboard de projetos por pontos, na ordem da linha do MODELO —
          gráficos, leaderboard, seção "Projetos no recorte". Recorte: os MESMOS projetos
          filtrados do topo + o seletor de projeto da aba. */}
      <ProjectLeaderboard projects={scopedProjects} onProjectSelect={onProjectSelect} />

      <section aria-labelledby="manager-projects-title" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3"><div><h2 id="manager-projects-title" className="font-semibold">Projetos no recorte</h2><p className="text-sm text-muted-foreground">Andamento temporal, com tarefas como alternativa quando não há período definido.</p></div></div>
        {scopedProjects.length === 0 ? <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">Nenhum projeto disponível neste recorte.</p> : <div className="divide-y rounded-lg border">{scopedProjects.map(project => {
          const progress = projectProgress(project, tasks, today)
          return <div key={project.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.7fr)_auto] sm:items-center">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-medium">{project.name}</h3><Badge variant="outline" className="text-xs">{projectStatusLabel[project.status]}</Badge></div>{project.description && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{project.description}</p>}</div>
            <div className="space-y-1"><div className="flex justify-between gap-2 text-xs"><span className="text-muted-foreground">{progress.source === "time" ? "Andamento temporal" : progress.detail}</span><span className="font-medium tabular-nums">{progress.percent}%</span></div><Progress value={progress.percent} className="h-1.5" /></div>
            {onProjectSelect && <Button variant="ghost" size="sm" className="justify-self-end" onClick={() => onProjectSelect(project)} aria-label={`Ver detalhes de ${project.name}`}>Abrir <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>}
          </div>
        })}</div>}
      </section>
    </div>
  )
}
