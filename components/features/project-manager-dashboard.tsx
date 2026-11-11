"use client"

import { useEffect, useState } from "react"

import { ProjectLeaderboard } from "@/components/features/project-leaderboard"
import type { Project, Task, User } from "@/contexts/types"

interface ProjectManagerDashboardProps {
  projects: Project[]
  tasks: Task[]
  users: User[]
  scopeDescription?: string
  onProjectSelect?: (project: Project) => void
}

/**
 * Painel da aba Projetos do Quadro de Liderança (plan-v18 S03, DEC-249; plan-v23 S04, DEC-268).
 *
 * plan-v23 S04 (DEC-268): a seção "Projetos no recorte" saiu por pedido do dono em
 * 2026-11-11 — o painel é só o leaderboard. O seletor continua recortando a coleção que o
 * `ProjectLeaderboard` recebe; nada mais mora aqui.
 */
export function ProjectManagerDashboard({ projects, tasks, users, scopeDescription, onProjectSelect }: ProjectManagerDashboardProps) {
  const [selectedProjectId, setSelectedProjectId] = useState("all")
  useEffect(() => {
    if (selectedProjectId !== "all" && !projects.some(project => String(project.id) === selectedProjectId)) {
      setSelectedProjectId("all")
    }
  }, [projects, selectedProjectId])

  const selectedProject = selectedProjectId === "all" ? null : projects.find(project => String(project.id) === selectedProjectId) ?? null
  const scopedProjects = selectedProject ? [selectedProject] : projects
  const scopeLabel = selectedProject ? `Projeto: ${selectedProject.name}` : scopeDescription || "Todos os projetos"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Recorte: <span className="font-medium text-foreground">{scopeLabel}</span></p>
        <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Projeto</span><select aria-label="Selecionar projeto para estatísticas" value={selectedProjectId} onChange={event => setSelectedProjectId(event.target.value)} className="h-9 max-w-[min(18rem,65vw)] rounded-md border bg-background px-3 text-sm"><option value="all">Todos os projetos</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      </div>

      <ProjectLeaderboard projects={scopedProjects} tasks={tasks} users={users} onProjectSelect={onProjectSelect} />
    </div>
  )
}
