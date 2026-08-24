"use client"

import { useState } from "react"
import { useProject } from "@/contexts/project-context"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ProjectDialog } from "./project-dialog"
import { Plus, Edit, Trash2, Calendar, Eye } from "lucide-react"
import type { Project } from "@/contexts/types"
import { hasAccess } from "@/lib/utils/utils"

const statusColors = {
  active: "bg-green-100 text-green-800 dark:bg-success/15 dark:text-green-300",
  completed: "bg-blue-100 text-blue-800 dark:bg-info/15 dark:text-blue-300",
  archived: "bg-gray-100 text-gray-800 dark:bg-muted/50 dark:text-gray-200",
}

const statusLabels = {
  active: "Ativo",
  completed: "Concluído",
  archived: "Arquivado",
}

interface ProjectListProps {
  onProjectSelect?: (project: Project) => void
  projects?: Project[]
}

export function ProjectList({ onProjectSelect, projects: providedProjects }: ProjectListProps) {
  const { user } = useAuth()
  const { projects: contextProjects, deleteProject, loading } = useProject()
  const { users } = useUser()
  const projects = providedProjects ?? contextProjects
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
              <div className="h-4 bg-gray-200 dark:bg-muted/60 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 dark:bg-muted/60 rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-3 bg-gray-200 dark:bg-muted/60 rounded w-full mb-2"></div>
              <div className="h-3 bg-gray-200 dark:bg-muted/60 rounded w-2/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Projetos</h2>
          <p className="text-muted-foreground">
            Gerencie os projetos do laboratório
          </p>
        </div>
        {user && hasAccess(user?.roles || [], 'MANAGE_PROJECTS') && (
          <Button onClick={handleCreateNew}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Projeto
          </Button>
        )}
      </div>

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
            {user && hasAccess(user?.roles || [], 'MANAGE_PROJECTS') && (
              <Button onClick={handleCreateNew}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeiro Projeto
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <CardDescription>
                      Criado em {new Date(project.createdAt).toLocaleDateString("pt-BR")}
                    </CardDescription>
                  </div>
                  <Badge className={statusColors[project.status as keyof typeof statusColors]}>
                    {statusLabels[project.status as keyof typeof statusLabels]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {project.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                    {project.description}
                  </p>
                )}

                <div className="flex justify-between items-center">
                  <div className="text-xs text-muted-foreground">
                    Criado por: {users.find(u => u.id === project.createdBy)?.name || project.createdBy}
                  </div>

                  <div className="flex space-x-2">
                    {onProjectSelect && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onProjectSelect(project)}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    )}
                    {user && hasAccess(user?.roles || [], 'MANAGE_PROJECTS') && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(project)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(project.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {project.links &&
                  <div>
                    <hr className="border-t border-gray-300 dark:border-border m-4" />
                    <h3 className="mt-2 align-middle text-center m-2">Links</h3>
                    <div className="flex flex-row gap-4 m-4">
                      {project.links.filter(l => l?.url && l?.label).length > 0
                        ? project.links
                          .filter(l => l?.url && l?.label)
                          .map((l, i) => (
                            <div className="w-auto h-auto p-4 bg-secondary rounded-md" key={i}>
                              <a href={l.url} target="_blank" rel="noopener noreferrer">
                                {l.label}
                              </a>
                            </div>
                          ))
                        : <div>
                          <p>Não há links cadastrados nesse projeto.</p>
                        </div>
                      }
                    </div>
                  </div>
                }

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
