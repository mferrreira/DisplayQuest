"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useProject } from "@/contexts/project-context"
import { useTask } from "@/contexts/task-context"
import { AppHeader } from "@/components/layout/app-header"
import { ProjectList } from "@/components/features/project-list"
import { ProjectDetailDialog } from "@/components/ui/project-detail-dialog"
import { ProjectDialog } from "@/components/features/project-dialog"
import { ProjectManagerDashboard } from "@/components/features/project-manager-dashboard"
import { VolunteersManagement } from "@/components/features/volunteers-management"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  Search,
  Filter,
  BarChart3,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Archive,
  UserPlus,
  Settings,
  TrendingUp,
  Award
} from "lucide-react"
import type { Project } from "@/contexts/types"
import { hasAccess } from "@/lib/utils/access-control"

// Helper para verificar se usuário tem GOD MODE (coordenador ou gerente)
const hasGodMode = (userRoles: string[]) => {
  return userRoles?.includes('COORDENADOR') || userRoles?.includes('GERENTE')
}


export default function ProjetosPage() {
  const { user } = useAuth()
  const { projects, loading } = useProject()
  const { tasks } = useTask()

  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)

  // A API já filtra os projetos baseado no usuário, então só aplicamos filtros de busca e status
  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || project.status === statusFilter
    return matchesSearch && matchesStatus
  });

  const overallStats = {
    total: projects.length,
    active: projects.filter(p => p.status === "active").length,
    completed: projects.filter(p => p.status === "completed").length,
    archived: projects.filter(p => p.status === "archived").length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter(t => t.status === "done").length
  }

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project)
    setIsDetailDialogOpen(true)
  }

  const handleEditProject = (project: Project) => {
    setEditingProject(project)
    setIsProjectDialogOpen(true)
  }

  const handleDeleteProject = async (projectId: number) => {
    if (confirm("Tem certeza que deseja excluir este projeto?")) {
      try {
        setIsDetailDialogOpen(false)
      } catch (error) {
        console.error("Erro ao excluir projeto:", error)
      }
    }
  }

  const handleCreateProject = () => {
    setEditingProject(null)
    setIsProjectDialogOpen(true)
  }

  const showDashboard = user?.roles?.includes('GERENTE_PROJETO') ?? false
  const showVolunteers = (user?.roles?.includes('GERENTE_PROJETO') || hasGodMode(user?.roles || []))
  const tabCount = 1 + (showDashboard ? 1 : 0) + (showVolunteers ? 1 : 0)
  const tabGridClass = tabCount >= 4
    ? 'grid-cols-4'
    : tabCount === 3
      ? 'grid-cols-3'
      : tabCount === 2
        ? 'grid-cols-2'
        : 'grid-cols-1'

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">

        <main className="flex-1 container mx-auto p-4 md:p-6">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Faça login para acessar os projetos</p>
          </div>
        </main>
      </div>
    )
  }

  if (!hasAccess(user?.roles || [], "VIEW_PROJECT_DASHBOARD")) {
    return (
      <div className="flex min-h-screen flex-col">

        <main className="flex-1 container mx-auto p-4 md:p-6">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">

      <main className="flex-1 container mx-auto p-4 md:p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {user?.roles?.includes('GERENTE_PROJETO') ? 'Meus Projetos' : 'Gerenciamento de Projetos'}
              </h1>
              <p className="text-muted-foreground">
                {user?.roles?.includes('GERENTE_PROJETO') 
                  ? 'Gerencie seus projetos e equipe de voluntários'
                  : 'Organize e acompanhe todos os projetos do laboratório'
                }
              </p>
            </div>

            {/* Statistics Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total de Projetos</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overallStats.total}</div>
                  <p className="text-xs text-muted-foreground">
                    {overallStats.active} ativos, {overallStats.completed} concluídos
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Projetos Ativos</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overallStats.active}</div>
                  <p className="text-xs text-muted-foreground">
                    Em desenvolvimento
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total de Tarefas</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overallStats.totalTasks}</div>
                  <p className="text-xs text-muted-foreground">
                    {overallStats.completedTasks} concluídas
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Taxa de Conclusão</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {overallStats.totalTasks > 0
                      ? Math.round((overallStats.completedTasks / overallStats.totalTasks) * 100)
                      : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Geral dos projetos
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar projetos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full md:w-64"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="completed">Concluídos</SelectItem>
                  <SelectItem value="archived">Arquivados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-sm">
                {filteredProjects.length} projeto{filteredProjects.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>

          {/* Projects Content */}
          <Tabs defaultValue={showDashboard ? "dashboard" : "list"} className="space-y-4">
            <TabsList className={`grid w-full ${tabGridClass}`}>
              {showDashboard &&
                <TabsTrigger value="dashboard" className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Dashboard
                </TabsTrigger>
              }
              <TabsTrigger value="list" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Lista de Projetos
              </TabsTrigger>
              {showVolunteers &&
                <TabsTrigger value="volunteers" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Voluntários
                </TabsTrigger>
              }
            </TabsList>

            {/* Tab Dashboard - Apenas para Gerentes de Projeto */}
            {showDashboard &&
            <TabsContent value="dashboard" className="space-y-4">
              <ProjectManagerDashboard 
                projects={projects} 
                tasks={tasks} 
                user={user} 
              />
            </TabsContent>
            }

            <TabsContent value="list" className="space-y-4">
              <ProjectList
                onProjectSelect={handleProjectClick}
                projects={filteredProjects}
              />
            </TabsContent>
            

            {/* Tab Voluntários - Apenas para Gerentes de Projeto */}
            {showVolunteers &&
            <TabsContent value="volunteers" className="space-y-6">
              <VolunteersManagement />
            </TabsContent>
            }
          </Tabs>
        </div>

        {/* Dialogs */}
        <ProjectDetailDialog
          project={selectedProject}
          open={isDetailDialogOpen}
          onOpenChange={setIsDetailDialogOpen}
          onEditProject={handleEditProject}
          onDeleteProject={handleDeleteProject}
        />

        <ProjectDialog
          open={isProjectDialogOpen}
          onOpenChange={setIsProjectDialogOpen}
          project={editingProject}
        />

      </main>
    </div>
  )
}
