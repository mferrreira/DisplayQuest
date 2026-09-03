"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Users,
  Clock,
  CheckCircle2,
  Award,
  TrendingUp,
  Target,
  Calendar,
  AlertCircle,
  BarChart3
} from "lucide-react"
import type { Project, Task } from "@/contexts/types"
import { isOverdueDateOnly } from "@/lib/date-only"

interface ProjectManagerDashboardProps {
  projects: Project[]
  tasks: Task[]
  user: any
}

export function ProjectManagerDashboard({ projects, tasks, user }: ProjectManagerDashboardProps) {
  // Calcular estatísticas específicas do gerente
  const managerProjects = projects.filter(project => project.leaderId === user?.id)
  const managerTasks = tasks.filter(task => 
    managerProjects.some(project => project.id === task.projectId)
  )
  
  const totalTasks = managerTasks.length
  const completedTasks = managerTasks.filter(task => task.status === "done").length
  const inProgressTasks = managerTasks.filter(task => task.status === "in-progress").length
  const overdueTasks = managerTasks.filter(task => {
    if (!task.dueDate || task.status === "done") return false
    return isOverdueDateOnly(task.dueDate)
  }).length
  
  const totalPoints = managerTasks.reduce((sum, task) => sum + (task.points || 0), 0)
  const completedPoints = managerTasks
    .filter(task => task.status === "done")
    .reduce((sum, task) => sum + (task.points || 0), 0)
  
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const pointsRate = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Estatísticas Principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Meus Projetos</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{managerProjects.length}</div>
            <p className="text-xs text-muted-foreground">
              {managerProjects.filter(p => p.status === 'active').length} ativos
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasks Totais</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTasks}</div>
            <p className="text-xs text-muted-foreground">
              {inProgressTasks} em andamento
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Conclusão</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionRate}%</div>
            <p className="text-xs text-muted-foreground">
              {completedTasks} de {totalTasks} concluídas
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pontos Conquistados</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedPoints}</div>
            <p className="text-xs text-muted-foreground">
              {pointsRate}% de {totalPoints} pontos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas e Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500 dark:text-orange-400" />
              Alertas Importantes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overdueTasks > 0 && (
              <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-500/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-500 dark:text-orange-400" />
                  <span className="text-sm font-medium">Tasks Atrasadas</span>
                </div>
                <Badge variant="destructive">{overdueTasks}</Badge>
              </div>
            )}
            
            {inProgressTasks > 0 && (
              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-info/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500 dark:text-info" />
                  <span className="text-sm font-medium">Em Andamento</span>
                </div>
                <Badge variant="secondary">{inProgressTasks}</Badge>
              </div>
            )}
            
            {completedTasks > 0 && (
              <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-success/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-success" />
                  <span className="text-sm font-medium">Concluídas</span>
                </div>
                <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-success/15 dark:text-green-300">
                  {completedTasks}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500 dark:text-success" />
              Progresso Geral
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Conclusão de Tasks</span>
                <span>{completionRate}%</span>
              </div>
              <Progress value={completionRate} className="h-2" />
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Pontos Conquistados</span>
                <span>{pointsRate}%</span>
              </div>
              <Progress value={pointsRate} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumo dos Projetos */}
      <Card>
        <CardHeader>
          <CardTitle>Resumo dos Meus Projetos</CardTitle>
          <CardDescription>
            Visão geral do progresso dos seus projetos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {managerProjects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum projeto atribuído</h3>
                <p className="text-sm">
                  Você ainda não foi designado como líder de nenhum projeto.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {managerProjects.map((project) => {
                  const projectTasks = tasks.filter(task => task.projectId === project.id)
                  const projectCompleted = projectTasks.filter(task => task.status === "done").length
                  const projectTotal = projectTasks.length
                  const projectProgress = projectTotal > 0 ? Math.round((projectCompleted / projectTotal) * 100) : 0
                  
                  return (
                    <div key={project.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">{project.name}</h4>
                        <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                          {project.status === 'active' ? 'Ativo' : 'Concluído'}
                        </Badge>
                      </div>
                      
                      {project.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {project.description}
                        </p>
                      )}
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Progresso</span>
                          <span>{projectProgress}%</span>
                        </div>
                        <Progress value={projectProgress} className="h-2" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{projectCompleted} de {projectTotal} tasks</span>
                          <span>Criado em {new Date(project.createdAt).toLocaleDateString("pt-BR")}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


