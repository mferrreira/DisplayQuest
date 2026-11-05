"use client"

import { useEffect, useState } from "react"
import { ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { projectStatusLabel } from "@/components/ui/status"
import { civilDayOfInstant } from "@/backend/domain"
import { projectProgress } from "@/features/projects/utils/project-progress"
import { ProjectLeaderboard } from "@/components/features/project-leaderboard"
import type { Project, Task } from "@/contexts/types"

interface ProjectManagerDashboardProps {
  projects: Project[]
  tasks: Task[]
  scopeDescription?: string
  onProjectSelect?: (project: Project) => void
}

export function ProjectManagerDashboard({ projects, tasks, scopeDescription, onProjectSelect }: ProjectManagerDashboardProps) {
  const [selectedProjectId, setSelectedProjectId] = useState("all")
  useEffect(() => {
    if (selectedProjectId !== "all" && !projects.some(project => String(project.id) === selectedProjectId)) {
      setSelectedProjectId("all")
    }
  }, [projects, selectedProjectId])

  const selectedProject = selectedProjectId === "all" ? null : projects.find(project => String(project.id) === selectedProjectId) ?? null
  const scopedProjects = selectedProject ? [selectedProject] : projects
  const today = civilDayOfInstant(new Date())
  const scopeLabel = selectedProject ? `Projeto: ${selectedProject.name}` : scopeDescription || "Todos os projetos"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Recorte: <span className="font-medium text-foreground">{scopeLabel}</span></p>
        <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Projeto</span><select aria-label="Selecionar projeto para estatísticas" value={selectedProjectId} onChange={event => setSelectedProjectId(event.target.value)} className="h-9 max-w-[min(18rem,65vw)] rounded-md border bg-background px-3 text-sm"><option value="all">Todos os projetos</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      </div>

      {/* S06 (regra 6): leaderboard de projetos por pontos. Os cards de gráficos da linha
          S05 saíram por decisão do dono em 2026-11-05 — a aba é só leaderboard. Recorte: os
          MESMOS projetos filtrados do topo + o seletor de projeto da aba. */}
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
