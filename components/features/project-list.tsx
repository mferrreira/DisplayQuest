"use client"

import { useState } from "react"
import Link from "next/link"
import { useProject } from "@/contexts/project-context"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ProjectDialog } from "./project-dialog"
import { Plus, Edit, Trash2, Calendar, ArrowUpRight } from "lucide-react"
import type { Project, Task } from "@/contexts/types"
import { hasAccess } from "@/lib/utils/utils"
import { projectStatusBadgeClass, projectStatusLabel } from "@/components/ui/status"
import { projectProgress } from "@/features/projects/utils/project-progress"
import { projectImageUrl } from "@/lib/api/project-files"
import { civilDayOfInstant } from "@/backend/domain"

interface ProjectListProps {
  /** S01: o cartão virou link; a página ainda passa a prop, nada a consumir. */
  onProjectSelect?: (project: Project) => void
  projects?: Project[]
  tasks?: Task[]
  showCreateButton?: boolean
}

export function ProjectList({ onProjectSelect, projects: providedProjects, tasks = [], showCreateButton = true }: ProjectListProps) {
  const { user } = useAuth()
  const { projects: contextProjects, deleteProject, loading } = useProject()
  const { users } = useUser()
  const projects = providedProjects ?? contextProjects
  const today = civilDayOfInstant(new Date())
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const handleEdit = (project: Project) => {
    setSelectedProject(project)
    setIsDialogOpen(true)
  }

  const handleDelete = async (projectId: number) => {
    if (confirm("Tem certeza que deseja excluir este projeto?")) {
      try {
        await deleteProject(projectId)
      } catch (error) {
        console.error("Erro ao excluir projeto:", error)
      }
    }
  }

  const handleCreateNew = () => {
    setSelectedProject(null)
    setIsDialogOpen(true)
  }

  const handleDialogClose = () => {
    setIsDialogOpen(false)
    setSelectedProject(null)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-3 bg-muted rounded w-full mb-2"></div>
              <div className="h-3 bg-muted rounded w-2/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {showCreateButton && user && hasAccess(user?.roles || [], 'MANAGE_PROJECTS') && (
          <Button onClick={handleCreateNew}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Projeto
          </Button>
      )}

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum projeto encontrado</h3>
            <p className="text-muted-foreground text-center mb-4">
              {user && hasAccess(user?.roles || [], 'MANAGE_PROJECTS')
                ? "Você ainda não foi adicionado a nenhum projeto."
                : "Comece criando seu primeiro projeto para organizar as atividades do laboratório."
              }
            </p>
            {showCreateButton && user && hasAccess(user?.roles || [], 'MANAGE_PROJECTS') && (
              <Button onClick={handleCreateNew}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeiro Projeto
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Card key={project.id} className="relative transition-colors hover:border-primary/40">
              {project.bannerKey && (
                // O corte do banner mora num divisor interno; o logo fica FORA dele, senão o
                // overflow-hidden ceifa a metade que cruza a emenda (achado da revisão S01).
                <div className="relative h-16 sm:h-24">
                  <div className="h-full overflow-hidden rounded-t-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={projectImageUrl(project.id, "banner", project.bannerKey)}
                      alt={`Capa do projeto ${project.name}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  {project.logoKey && (
                    <img
                      src={projectImageUrl(project.id, "logo", project.logoKey)}
                      alt={`Logo do projeto ${project.name}`}
                      className="absolute bottom-0 left-4 h-12 w-12 translate-y-1/2 rounded-full border-4 border-card bg-card object-cover sm:h-14 sm:w-14"
                    />
                  )}
                </div>
              )}
              {!project.bannerKey && project.logoKey && (
                // Mesmo tratamento de círculo das duas situações; o reference proíbe um segundo
                // desenho para o mesmo conceito.
                <img
                  src={projectImageUrl(project.id, "logo", project.logoKey)}
                  alt={`Logo do projeto ${project.name}`}
                  className="ml-4 mt-4 h-12 w-12 rounded-full border-4 border-card bg-card object-cover"
                />
              )}
              {/* Link esticado (S01): uma única âncora cobre o cartão; os controles de gestão
                  ficam com z acima dela, e o botão olho saiu. */}
              <Link
                href={`/dashboard/projetos/${project.id}`}
                aria-label={`Ver projeto ${project.name}`}
                className="absolute inset-0 z-10 rounded-lg outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              />
              <CardContent className={`grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5 ${project.bannerKey ? "pt-10" : ""}`}>
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    <Badge className={projectStatusBadgeClass[project.status]}>{projectStatusLabel[project.status]}</Badge>
                  </div>
                  {project.description && <CardDescription className="line-clamp-2">{project.description}</CardDescription>}
                  {(() => {
                    const progress = projectProgress(project, tasks, today)
                    return (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{progress.source === "time" ? "Andamento temporal" : progress.detail}</span><span>{progress.percent}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label={`Progresso de ${project.name}`}>
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
                        </div>
                      </div>
                    )
                  })()}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Criado por {users.find(u => u.id === project.createdBy)?.name || project.createdBy}</span>
                    <span>Criado em {new Date(project.createdAt).toLocaleDateString("pt-BR")}</span>
                    {project.startDate && <span>Início: {new Date(`${project.startDate}T00:00:00`).toLocaleDateString("pt-BR")}</span>}
                    {project.endDate && <span>Término: {new Date(`${project.endDate}T00:00:00`).toLocaleDateString("pt-BR")}</span>}
                  </div>
                  {project.links?.filter(link => link?.url && link?.label).length ? (
                    <div className="flex flex-wrap gap-3 text-sm">
                      {project.links.filter(link => link?.url && link?.label).map((link, index) => <a className="relative z-20 inline-flex items-center gap-1 text-primary hover:underline" key={index} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ArrowUpRight className="h-3 w-3" /></a>)}
                    </div>
                  ) : null}
                </div>
                <div className="relative z-20 flex items-center gap-2 sm:justify-end">
                    {user && hasAccess(user?.roles || [], 'MANAGE_PROJECTS') && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Editar projeto ${project.name}`}
                          onClick={() => handleEdit(project)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Excluir projeto ${project.name}`}
                          onClick={() => handleDelete(project.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ProjectDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        project={selectedProject}
      />
    </div>
  )
}
