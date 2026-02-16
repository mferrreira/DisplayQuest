"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import {
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Edit,
  Trash2,
  Plus,
  Link
} from "lucide-react"
import { useTask } from "@/contexts/task-context"
import { TaskDialog } from "@/components/features/task-dialog"
import type { Project, Task } from "@/contexts/types"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { ProjectMembersManager } from "@/components/forms/project-members-manager"
import { ProjectMembersManagement } from "@/components/features/project-members-management"
import { ProjectHoursStats } from "@/components/features/project-hours-stats"
import { hasAccess } from "@/lib/utils/utils"

interface ProjectDetailDialogProps {
  project: Project | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEditProject: (project: Project) => void
  onDeleteProject: (projectId: number) => void
}

export function ProjectDetailDialog({
  project,
  open,
  onOpenChange,
  onEditProject,
  onDeleteProject
}: ProjectDetailDialogProps) {
  const { tasks, createTask } = useTask()
  const { user } = useAuth()
  const { users } = useUser()
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  if (!project) return null

  const projectTasks = tasks.filter(task => task.projectId === project.id)
  const totalTasks = projectTasks.length
  const completedTasks = projectTasks.filter(task => task.status === "done").length
  const pendingTasks = projectTasks.filter(task => task.status === "to-do").length
  const inProgressTasks = projectTasks.filter(task =>
    task.status === "in-progress" || task.status === "in-review" || task.status === "adjust"
  ).length
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const statusColors = {
    active: "bg-green-100 text-green-800",
    completed: "bg-blue-100 text-blue-800",
    archived: "bg-gray-100 text-gray-800",
  }

  const statusLabels = {
    active: "Ativo",
    completed: "Concluído",
    archived: "Arquivado",
  }

  const taskStatusColors = {
    "to-do": "bg-yellow-100 text-yellow-800",
    "in-progress": "bg-blue-100 text-blue-800",
    "in-review": "bg-purple-100 text-purple-800",
    "adjust": "bg-orange-100 text-orange-800",
    "done": "bg-green-100 text-green-800",
  }

  const taskStatusLabels = {
    "to-do": "A Fazer",
    "in-progress": "Em Progresso",
    "in-review": "Em Revisão",
    "adjust": "Ajustes",
    "done": "Concluída",
  }

  const handleCreateTask = () => {
    setSelectedTask(null)
    setIsTaskDialogOpen(true)
  }

  const handleEditTask = (task: Task) => {
    setSelectedTask(task)
    setIsTaskDialogOpen(true)
  }

  const handleTaskDialogClose = () => {
    setIsTaskDialogOpen(false)
    setSelectedTask(null)
  }

  const handleAddLink = (e: any) => {
    e.preventDefault()
    console.log("Adicionou os link")
  }

  const getUserNameById = (userId?: number | null) => {
    if (!userId) return "Não atribuído"
    return users.find((u) => u.id === Number(userId))?.name || `Usuário #${userId}`
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl h-[90vh]" style={{ overflowY: 'auto' }}>
          <DialogHeader>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <DialogTitle className="text-2xl">{project.name}</DialogTitle>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={statusColors[project.status as keyof typeof statusColors]}>
                    {statusLabels[project.status as keyof typeof statusLabels]}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Criado em {new Date(project.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                {user && hasAccess(user.roles, "EDIT_PROJECT") && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEditProject(project)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDeleteProject(project.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 overflow-y-auto max-h-[70vh] pr-2">
            {/* Project Description */}
            {project.description && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Descrição
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{project.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Project Statistics */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total de Tarefas</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalTasks}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{completedTasks}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Em Progresso</CardTitle>
                  <Clock className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{inProgressTasks}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">{pendingTasks}</div>
                </CardContent>
              </Card>
            </div>

            {/* Progress Bar */}
            <Card>
              <CardHeader>
                <CardTitle>Progresso Geral</CardTitle>
                <CardDescription>
                  {completionRate}% concluído ({completedTasks} de {totalTasks} tarefas)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Progress value={completionRate} className="h-3" />
              </CardContent>
            </Card>

            {/* Tasks Section */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Tarefas do Projeto
                  </CardTitle>
                  {user && hasAccess(user.roles, "CREATE_TASK") && (
                    <Button onClick={handleCreateTask} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Nova Tarefa
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {projectTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Nenhuma tarefa encontrada</h3>
                    <p className="text-muted-foreground mb-4">
                      Este projeto ainda não possui tarefas. Crie a primeira tarefa para começar.
                    </p>
                    {user && hasAccess(user.roles, "CREATE_TASK") && (
                      <Button onClick={handleCreateTask}>
                        <Plus className="h-4 w-4 mr-2" />
                        Criar Primeira Tarefa
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {projectTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{task.title}</h4>
                            <Badge className={taskStatusColors[task.status as keyof typeof taskStatusColors]}>
                              {taskStatusLabels[task.status as keyof typeof taskStatusLabels]}
                            </Badge>
                            {task.taskVisibility === "public" && (
                              <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700">
                                Pública
                              </Badge>
                            )}
                          </div>
                          {task.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {task.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>Responsável: {getUserNameById(task.assignedTo)}</span>
                            <span>Pontos: {task.points}</span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditTask(task)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Project Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Informações do Projeto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="font-medium mb-2">Detalhes</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Criado por:</span>
                        <span>{getUserNameById(project.createdBy)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Data de criação:</span>
                        <span>{new Date(project.createdAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <Badge className={statusColors[project.status as keyof typeof statusColors]}>
                          {statusLabels[project.status as keyof typeof statusLabels]}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Resumo</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total de tarefas:</span>
                        <span>{totalTasks}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Taxa de conclusão:</span>
                        <span>{completionRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Última atualização:</span>
                        <span>{new Date(project.createdAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link className="h-5 w-5" />
                    Links
                  </div>
                </CardTitle>
              </CardHeader>

              <CardContent>
                <div className="mb-4">

                  {hasAccess(user?.roles || [], "EDIT_PROJECT") &&
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Input 
                        placeholder="Nome (ex: Figma, GitHub)"
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                        placeholder="Link"
                        />
                      </div>
                      <Button type="button" variant="outline" onClick={handleAddLink}>
                        + Adicionar Link
                      </Button>
                    </div>  
                  }

                </div>
                {project?.links?.length === 0 ? (
                  <div className="text-muted-foreground">
                    <p>Não há links para esse projeto</p>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {project?.links?.map((link, i) => (

                      <div key={i} className="flex gap-2 mb-2">
                        <div className="flex-1 flex p-2 border rounded">
                          {link.label}
                        </div>
                          <a href={link.url} target="_blank">
                        <div className="flex-3 flex p-2 border rounded">
                          {link.url}
                        </div>
                          </a>
                      </div>
                    ))}
                    </div>
)}
              </CardContent>

            </Card>
            
            {/* Project Hours Statistics */}
            <ProjectHoursStats project={project} />
            
            {/* Project Membership Management (only for allowed roles) */}
            {(user && (hasAccess(user.roles, "MANAGE_PROJECT_MEMBERS") || user.roles.includes('COORDENADOR') || user.roles.includes('GERENTE'))) && (
              <ProjectMembersManagement 
                project={project} 
                onUpdate={() => {
                  // Atualizar dados do projeto se necessário
                  console.log('Projeto atualizado')
                }} 
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <TaskDialog
        open={isTaskDialogOpen}
        onOpenChange={handleTaskDialogClose}
        task={selectedTask}
        projectId={project.id.toString()}
      />
    </>
  )
} 
