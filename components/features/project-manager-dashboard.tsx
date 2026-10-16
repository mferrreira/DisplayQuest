"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { MiniDonutChart, StackedBarChart, WeeklyBarChart } from "@/components/ui/data-charts"
import { projectStatusChartColor, projectStatusLabel, taskStatusChartColor, taskStatusLabel } from "@/components/ui/status"
import { civilDayOfInstant } from "@/backend/domain"
import { projectProgress } from "@/features/projects/utils/project-progress"
import { weeklyTaskCompletions } from "@/features/projects/utils/weekly-completions"
import type { Project, Task } from "@/contexts/types"
import { isOverdueDateOnly } from "@/lib/date-only"
import { ArrowUpRight } from "lucide-react"
import { useEffect, useState } from "react"

interface ProjectManagerDashboardProps {
  projects: Project[]
  tasks: Task[]
  scopeDescription?: string
  onProjectSelect?: (project: Project) => void
}

const TASK_STATUSES: Task["status"][] = ["to-do", "in-progress", "in-review", "adjust", "done"]

export function ProjectManagerDashboard({ projects, tasks, scopeDescription, onProjectSelect }: ProjectManagerDashboardProps) {
  const [selectedProjectId, setSelectedProjectId] = useState("all")
  useEffect(() => {
    if (selectedProjectId !== "all" && !projects.some(project => String(project.id) === selectedProjectId)) {
      setSelectedProjectId("all")
    }
  }, [projects, selectedProjectId])
  const selectedProject = selectedProjectId === "all" ? null : projects.find(project => String(project.id) === selectedProjectId) ?? null
  const scopedProjects = selectedProject ? [selectedProject] : projects
  const visibleProjectIds = new Set(scopedProjects.map(project => project.id))
  const managerProjects = scopedProjects
  const managerTasks = tasks.filter(task => task.projectId != null && visibleProjectIds.has(task.projectId))
  const today = civilDayOfInstant(new Date())
  const taskCounts = Object.fromEntries(TASK_STATUSES.map(status => [status, managerTasks.filter(task => task.status === status).length])) as Record<Task["status"], number>
  const projectCounts = {
    active: managerProjects.filter(project => project.status === "active").length,
    completed: managerProjects.filter(project => project.status === "completed").length,
    archived: managerProjects.filter(project => project.status === "archived").length,
  }
  const overdue = managerTasks.filter(task => task.dueDate && task.status !== "done" && isOverdueDateOnly(task.dueDate)).length
  const taskSegments = TASK_STATUSES.map(status => ({ label: taskStatusLabel[status], value: taskCounts[status], color: taskStatusChartColor[status] }))
  const projectSegments = [
    { label: projectStatusLabel.active, value: projectCounts.active, color: projectStatusChartColor.active },
    { label: projectStatusLabel.completed, value: projectCounts.completed, color: projectStatusChartColor.completed },
    { label: projectStatusLabel.archived, value: projectCounts.archived, color: projectStatusChartColor.archived },
  ]
  const completed = taskCounts.done
  const completion = managerTasks.length ? Math.round(completed / managerTasks.length * 100) : 0
  const weeklyCompletions = weeklyTaskCompletions(managerTasks.filter(task => task.status === "done"), today)
  const scopeLabel = selectedProject ? `Projeto: ${selectedProject.name}` : scopeDescription || "Todos os projetos"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Estatísticas para <span className="font-medium text-foreground">{scopeLabel}</span></p>
        <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Projeto</span><select aria-label="Selecionar projeto para estatísticas" value={selectedProjectId} onChange={event => setSelectedProjectId(event.target.value)} className="h-9 max-w-[min(18rem,65vw)] rounded-md border bg-background px-3 text-sm"><option value="all">Todos os projetos</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      </div>
      <section aria-label="Indicadores dos projetos" className="grid gap-6 rounded-lg border p-4 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.2fr)] md:p-5">
        <div className="flex min-w-0 items-center gap-4">
          <MiniDonutChart label={`${scopeLabel}. Projetos por status: ${projectCounts.active} ativos, ${projectCounts.completed} concluídos, ${projectCounts.archived} arquivados`} centerValue={managerProjects.length} centerLabel="projetos" segments={projectSegments} size={100} />
          <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Projetos</h2><div className="mt-3 space-y-2 text-xs">{projectSegments.map((segment, index) => <div key={segment.label} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />{segment.label}</span><span className="font-medium tabular-nums">{segment.value}</span></div>)}</div></div>
        </div>
        <div className="min-w-0 border-t pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <div className="flex items-baseline justify-between gap-3"><h2 className="text-sm font-semibold">Tarefas por status</h2><span className="text-xs text-muted-foreground">{managerTasks.length} no total</span></div>
          <StackedBarChart label={`${scopeLabel}. Distribuição das tarefas por status`} segments={taskSegments} className="mt-3 h-3.5" />
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">{taskSegments.map(segment => <div key={segment.label} className="flex items-center justify-between gap-2 text-xs"><span className="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />{segment.label}</span><span className="font-medium tabular-nums">{segment.value}</span></div>)}</div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground"><span>{completion}% das tarefas concluídas</span>{overdue > 0 && <span className="font-medium text-warning">{overdue} atrasada{overdue === 1 ? "" : "s"}</span>}</div>
        </div>
      </section>

      <section aria-labelledby="weekly-completions-title" className="rounded-lg border p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><div><h2 id="weekly-completions-title" className="text-sm font-semibold">Histórico semanal</h2><p className="text-xs text-muted-foreground">Tarefas do projeto concluídas por semana · últimas 8 semanas</p></div><span className="text-xs text-muted-foreground">Semana de segunda a domingo</span></div>
          <WeeklyBarChart label={`${scopeLabel}. Histórico semanal de tarefas concluídas`} weeks={weeklyCompletions} />
      </section>

      <section aria-labelledby="manager-projects-title" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3"><div><h2 id="manager-projects-title" className="font-semibold">Projetos no recorte</h2><p className="text-sm text-muted-foreground">Andamento temporal, com tarefas como alternativa quando não há período definido.</p></div></div>
        {managerProjects.length === 0 ? <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">Nenhum projeto disponível neste recorte.</p> : <div className="divide-y rounded-lg border">{managerProjects.map(project => {
          const progress = projectProgress(project, tasks, today)
          return <div key={project.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.7fr)_auto] sm:items-center">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-medium">{project.name}</h3><Badge variant="outline" className="text-xs">{projectStatusLabel[project.status]}</Badge></div>{project.description && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{project.description}</p>}</div>
            <div className="space-y-1"><div className="flex justify-between gap-2 text-xs"><span className="text-muted-foreground">{progress.source === "time" ? "Andamento temporal" : progress.detail}</span><span className="font-medium tabular-nums">{progress.percent}%</span></div><Progress value={progress.percent} className="h-1.5" /></div>
            {onProjectSelect && <Button variant="ghost" size="sm" className="justify-self-end" onClick={() => onProjectSelect(project)} aria-label={`Ver detalhes de ${project.name}`}>Abrir <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Button>}
          </div>
        })}</div>}
      </section>
    </div>
  )
}
