"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useProject } from "@/contexts/project-context"
import { useTask } from "@/contexts/task-context"
import { useUser } from "@/contexts/user-context"
import { ProjectList } from "@/components/features/project-list"
import { ProjectDialog } from "@/components/features/project-dialog"
import { ProjectManagerDashboard } from "@/components/features/project-manager-dashboard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  Search,
  BarChart3,
  TrendingUp,
  FolderKanban
} from "lucide-react"
import type { Project } from "@/contexts/types"
import { hasAccess } from "@/lib/utils/access-control"


export default function ProjetosPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { projects } = useProject()
  const { tasks } = useTask()
  const { users } = useUser()

  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [personFilter, setPersonFilter] = useState<string>("all")
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)

  // Os filtros do topo são a fonte do recorte tanto da lista quanto dos gráficos.
  const searchAndStatusProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || project.status === statusFilter
    return matchesSearch && matchesStatus
  });
  const personId = personFilter === "all" ? null : Number(personFilter)
  const personTasks = personId === null ? tasks : tasks.filter(task =>
    task.assignedTo === personId || task.assigneeIds?.includes(personId),
  )
  const filteredProjects = searchAndStatusProjects.filter(project =>
    personId === null || personTasks.some(task => task.projectId === project.id),
  )
  const filteredProjectIds = new Set(filteredProjects.map(project => project.id))
  const filteredTasks = personTasks.filter(task => task.projectId != null && filteredProjectIds.has(task.projectId))
  const selectedPerson = personId === null ? null : users.find(person => person.id === personId)
  const scopeDescription = [
    searchTerm.trim() ? `busca “${searchTerm.trim()}”` : null,
    statusFilter !== "all" ? `status ${statusFilter}` : null,
    selectedPerson ? `pessoa ${selectedPerson.name}` : null,
  ].filter(Boolean).join(" · ") || "Todos os projetos"

  const overallStats = {
    total: projects.length,
    active: projects.filter(p => p.status === "active").length,
    completed: projects.filter(p => p.status === "completed").length,
    archived: projects.filter(p => p.status === "archived").length,
  }

  const handleProjectClick = (project: Project) => {
    router.push(`/dashboard/projetos/${project.id}`)
  }

  const handleCreateProject = () => {
    setEditingProject(null)
    setIsProjectDialogOpen(true)
  }

  const showDashboard = hasAccess(user?.roles || [], "DASHBOARD_PROJECT_MANAGER")
  // Preserva a aba inicial histórica: gerente de projeto começa no Dashboard; demais
  // papéis começam na lista, mesmo agora que coordenador/gerente também podem abrir o Dashboard.
  const defaultTab = user?.roles?.includes('GERENTE_PROJETO') ? "dashboard" : "list"
  // V6-9 (RF-V6.12/DEC-182): a aba Voluntários saiu daqui — vive no Painel Administrativo.
  const tabGridClass = showDashboard ? 'grid-cols-2' : 'grid-cols-1'

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
          <PageHeader
            title={user.roles.includes('GERENTE_PROJETO') ? 'Meus Projetos' : 'Gerenciamento de Projetos'}
            description={user.roles.includes('GERENTE_PROJETO') ? 'Gerencie seus projetos e equipe de voluntários' : 'Organize e acompanhe todos os projetos do laboratório'}
            icon={FolderKanban}
            actions={hasAccess(user.roles, 'MANAGE_PROJECTS') ? <Button onClick={handleCreateProject}><Plus className="mr-2 h-4 w-4" />Novo Projeto</Button> : undefined}
          />

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar projetos por status">
              {[
                { id: 'all', label: 'Todos', count: projects.length },
                { id: 'active', label: 'Ativos', count: overallStats.active },
                { id: 'completed', label: 'Concluídos', count: overallStats.completed },
                { id: 'archived', label: 'Arquivados', count: overallStats.archived },
              ].map(option => <Button key={option.id} type="button" size="sm" variant={statusFilter === option.id ? 'default' : 'outline'} aria-pressed={statusFilter === option.id} onClick={() => setStatusFilter(option.id)}>{option.label}<span className="ml-2 rounded-full bg-background/20 px-1.5 text-xs">{option.count}</span></Button>)}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input aria-label="Buscar projetos" placeholder="Buscar projetos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Pessoa</span><select aria-label="Filtrar por pessoa" value={personFilter} onChange={event => setPersonFilter(event.target.value)} className="h-9 max-w-[min(18rem,60vw)] rounded-md border bg-background px-3 text-sm"><option value="all">Todas as pessoas</option>{users.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <Badge variant="outline" className="w-fit text-sm">{filteredProjects.length} projeto{filteredProjects.length !== 1 ? 's' : ''}</Badge>
              </div>
            </div>
          </div>

          {/* Projects Content */}
          <Tabs defaultValue={defaultTab} className="space-y-4">
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
            </TabsList>

            {/* Tab Dashboard - Apenas para Gerentes de Projeto */}
            {showDashboard &&
            <TabsContent value="dashboard" className="space-y-4">
              <ProjectManagerDashboard 
                projects={filteredProjects} 
                tasks={filteredTasks}
                scopeDescription={scopeDescription}
                onProjectSelect={handleProjectClick}
              />
            </TabsContent>
            }

            <TabsContent value="list" className="space-y-4">
              <ProjectList
                onProjectSelect={handleProjectClick}
                projects={filteredProjects}
                tasks={filteredTasks}
                showCreateButton={false}
              />
            </TabsContent>
          </Tabs>
        </div>

        <ProjectDialog
          open={isProjectDialogOpen}
          onOpenChange={setIsProjectDialogOpen}
          project={editingProject}
        />

      </main>
    </div>
  )
}
