"use client"

import React, { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import {
  Users,
  BarChart3,
  Clock,
  Target,
  Settings,
  Bell,
  TrendingUp,
  Activity,
  Shield,
  Calendar,
  Award,
  FileText,
  Plus,
  Search,
  Filter,
  Download,
  RefreshCw,
  CheckCircle2,
  XCircle,
  User,
  Zap,
  AlertTriangle
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useTask } from "@/contexts/task-context"
import { UserApproval } from "@/components/features/user-approval"
import { ProjectMembersManagement } from "@/components/features/project-members-management"
import { ProjectHoursStats } from "@/components/features/project-hours-stats"
import { BadgeManager } from "@/components/admin/badge-manager"
import { AdminStatsCards } from "@/components/admin/AdminStatsCards"
import { AdminWeeklyHoursTable } from "@/components/admin/AdminWeeklyHoursTable"
import { AdminProjectManagement } from "@/components/admin/AdminProjectManagement"
import { AdminHoursManagement } from "@/components/admin/AdminHoursManagement"
import { AdminNotificationsCenter } from "@/components/admin/AdminNotificationsCenter"
import { ScheduleGrid } from "@/components/admin/ScheduleGrid"
import { NotificationsPanel } from "@/components/ui/notifications-panel"
import { CreateUserDialog } from "@/components/admin/create-user-dialog"
import { hasAccess } from "@/lib/utils/access-control"

interface ModernAdminPanelProps {
  users: any[]
  projects: any[]
  tasks: any[]
  sessions: any[]
  stats: any
}

export function ModernAdminPanel({ users, projects, tasks, sessions, stats }: ModernAdminPanelProps) {
  const { user } = useAuth()
  const { tasks: liveTasks, approveTask, rejectTask, fetchTasks } = useTask()
  const router = useRouter()
  // Ref para bloquear ações duplicadas antes do re-render (React state tem delay de ciclo)
  const inFlightTaskIds = useRef<Set<number>>(new Set())

  const [searchTerm, setSearchTerm] = useState("")
  const [filterRole, setFilterRole] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [taskStatusFilter, setTaskStatusFilter] = useState("all")
  const [taskProjectFilter, setTaskProjectFilter] = useState("all")
  const [taskActionLoading, setTaskActionLoading] = useState<number | null>(null)
  const [selectedProject, setSelectedProject] = useState<string>("")
  const [refreshing, setRefreshing] = useState(false)
  const [selectedUserForSettings, setSelectedUserForSettings] = useState<any | null>(null)
  const [userRolesDraft, setUserRolesDraft] = useState<string[]>([])
  const [userWeekHoursDraft, setUserWeekHoursDraft] = useState<string>("0")
  const [userNameDraft, setUserNameDraft] = useState<string>("")
  const [userEmailDraft, setUserEmailDraft] = useState<string>("")
  const [userBioDraft, setUserBioDraft] = useState<string>("")
  const [userPointsAction, setUserPointsAction] = useState<"set" | "add" | "remove">("set")
  const [userPointsValue, setUserPointsValue] = useState<string>("0")
  const [savingUserSettings, setSavingUserSettings] = useState(false)
  const [globalTasksProgress, setGlobalTasksProgress] = useState<any[]>([])
  const [loadingGlobalTasks, setLoadingGlobalTasks] = useState(false)
  const [createUserOpen, setCreateUserOpen] = useState(false)

  // Verificar permissões do usuário
  const canManageUsers = hasAccess(user?.roles || [], 'MANAGE_USERS')
  const canManageProjects = hasAccess(user?.roles || [], 'MANAGE_PROJECTS')
  const canManageTasks = hasAccess(user?.roles || [], 'MANAGE_TASKS')

  // TaskProvider already fetches all tasks on mount; no need to re-fetch here

  const canManageSchedule = hasAccess(user?.roles || [], 'MANAGE_SCHEDULE')
  const canManageBadges = hasAccess(user?.roles || [], 'MANAGE_BADGES')

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      router.refresh()
    } finally {
      setRefreshing(false)
    }
  }

  const exportData = (type: string) => {
    // Implementar exportação de dados
    console.log(`Exportando dados: ${type}`)
  }

  const openUserSettings = (targetUser: any) => {
    setSelectedUserForSettings(targetUser)
    setUserRolesDraft(targetUser?.roles || [])
    setUserWeekHoursDraft(String(targetUser?.weekHours ?? 0))
    setUserNameDraft(targetUser?.name || "")
    setUserEmailDraft(targetUser?.email || "")
    setUserBioDraft(targetUser?.bio || "")
    setUserPointsAction("set")
    setUserPointsValue(String(targetUser?.points ?? 0))
  }

  const updateUserStatus = async (targetUserId: number, action: "approve" | "reject" | "suspend" | "activate") => {
    const response = await fetch(`/api/users/${targetUserId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload?.error || "Erro ao atualizar status")
    }
    router.refresh()
  }

  const saveUserSettings = async () => {
    if (!selectedUserForSettings) return

    setSavingUserSettings(true)
    try {
      const rolesResponse = await fetch(`/api/users/${selectedUserForSettings.id}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set",
          roles: userRolesDraft,
        }),
      })
      if (!rolesResponse.ok) {
        const payload = await rolesResponse.json().catch(() => ({}))
        throw new Error(payload?.error || "Erro ao atualizar papéis do usuário")
      }

      const updateResponse = await fetch(`/api/users/${selectedUserForSettings.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userNameDraft,
          email: userEmailDraft,
          bio: userBioDraft || null,
          weekHours: Number(userWeekHoursDraft),
        }),
      })
      if (!updateResponse.ok) {
        const payload = await updateResponse.json().catch(() => ({}))
        throw new Error(payload?.error || "Erro ao atualizar usuário")
      }

      const pointsNum = Number(userPointsValue)
      if (!isNaN(pointsNum) && pointsNum >= 0) {
        const pointsResponse = await fetch(`/api/users/${selectedUserForSettings.id}/points`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: userPointsAction,
            points: pointsNum,
          }),
        })
        if (!pointsResponse.ok) {
          const payload = await pointsResponse.json().catch(() => ({}))
          throw new Error(payload?.error || "Erro ao atualizar pontos")
        }
      }

      setSelectedUserForSettings(null)
      router.refresh()
    } finally {
      setSavingUserSettings(false)
    }
  }

  const handleRoleToggle = (role: string) => {
    setUserRolesDraft(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    )
  }

  const availableRoles = [
    { value: 'VOLUNTARIO', label: 'Voluntário', description: 'Acesso básico ao sistema' },
    { value: 'COLABORADOR', label: 'Colaborador', description: 'Pode trabalhar em projetos' },
    { value: 'PESQUISADOR', label: 'Pesquisador', description: 'Acesso a funcionalidades de pesquisa' },
    { value: 'GERENTE_PROJETO', label: 'Gerente de Projeto', description: 'Gerencia projetos específicos' },
    { value: 'LABORATORISTA', label: 'Laboratorista', description: 'Acesso administrativo' },
    { value: 'GERENTE', label: 'Gerente', description: 'Acesso total ao sistema' },
    { value: 'COORDENADOR', label: 'Coordenador', description: 'Acesso completo e gestão de usuários' },
  ]

  useEffect(() => {
    const fetchGlobalTasksProgress = async () => {
      setLoadingGlobalTasks(true)
      try {
        const response = await fetch("/api/tasks/global-progress")
        const payload = await response.json()
        setGlobalTasksProgress(Array.isArray(payload?.globalTasks) ? payload.globalTasks : [])
      } catch (error) {
        setGlobalTasksProgress([])
      } finally {
        setLoadingGlobalTasks(false)
      }
    }

    if (canManageUsers) {
      fetchGlobalTasksProgress()
    }
  }, [canManageUsers, tasks.length])

  return (
    <div className="space-y-6">
      {/* Header com ações globais */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel Administrativo</h1>
          <p className="text-muted-foreground">
            Gerencie usuários, projetos, tarefas e todas as funcionalidades do sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Select onValueChange={exportData}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Exportar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="users">Usuários</SelectItem>
              <SelectItem value="projects">Projetos</SelectItem>
              <SelectItem value="hours">Horas</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards de estatísticas */}
      <AdminStatsCards 
        users={users}
        projects={projects}
        tasks={tasks}
        sessions={sessions}
        stats={stats}
      />

      {/* Tabs principais */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex w-full overflow-x-auto gap-1 h-auto flex-wrap">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Visão Geral</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Usuários</span>
          </TabsTrigger>
          <TabsTrigger value="projects" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Projetos</span>
          </TabsTrigger>
          <TabsTrigger value="hours" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Horas</span>
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Tarefas</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notificações</span>
          </TabsTrigger>
          <TabsTrigger value="badges" className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            <span className="hidden sm:inline">Badges</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Configurações</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab Visão Geral */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Usuários com sessões ativas */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Sessões Ativas
                </CardTitle>
                <CardDescription>
                  Usuários trabalhando no momento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sessions
                    .filter(session => session.status === 'active')
                    .slice(0, 5)
                    .map((session) => {
                      const user = users.find(u => u.id === session.userId)
                      if (!user) return null
                      
                      const startTime = new Date(session.startTime)
                      const formatDate = startTime.toLocaleDateString('pt-BR')
                      const formatTime = startTime.toLocaleTimeString('pt-BR', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })
                      
                      return (
                        <div key={session.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-green-600">
                                {user.name.split(' ').map((n: string) => n[0]).join('')}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-sm text-muted-foreground">
                                Iniciado: {formatDate} às {formatTime}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              {user.roles?.[0] || 'Usuário'}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              Trabalhando
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  {sessions.filter(session => session.status === 'active').length === 0 && (
                    <div className="text-center py-4">
                      <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Nenhuma sessão ativa no momento
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Projetos em andamento */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Projetos em Andamento
                </CardTitle>
                <CardDescription>
                  Projetos ativos e seu progresso
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {projects.filter(p => p.status === 'active').slice(0, 5).map((project) => (
                    <div key={project.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{project.name}</h4>
                        <Badge variant="secondary">{project.status}</Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Progresso</span>
                          <span>75%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="bg-blue-600 h-2 rounded-full" style={{ width: '75%' }}></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabela de horas semanais */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Horas Trabalhadas Esta Semana
              </CardTitle>
              <CardDescription>
                Resumo das horas trabalhadas por todos os usuários
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminWeeklyHoursTable users={users} sessions={sessions} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Usuários */}
        <TabsContent value="users" className="space-y-6">
          {canManageUsers && (
            <>
              {/* Filtros */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Gestão de Usuários
                  </CardTitle>
                  <CardDescription>
                    Gerencie usuários, aprovações e permissões
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                        <Input
                          placeholder="Buscar usuários..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <Button onClick={() => setCreateUserOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Usuário
                    </Button>
                    <Select value={filterRole} onValueChange={setFilterRole}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Função" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="COORDENADOR">Coordenador</SelectItem>
                        <SelectItem value="GERENTE">Gerente</SelectItem>
                        <SelectItem value="LABORATORISTA">Laboratorista</SelectItem>
                        <SelectItem value="GERENTE_PROJETO">Gerente de Projeto</SelectItem>
                        <SelectItem value="PESQUISADOR">Pesquisador</SelectItem>
                        <SelectItem value="COLABORADOR">Colaborador</SelectItem>
                        <SelectItem value="VOLUNTARIO">Voluntário</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="inactive">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Aprovação de usuários */}
              <UserApproval />

              {/* Lista de usuários */}
              <Card>
                <CardHeader>
                  <CardTitle>Usuários do Sistema</CardTitle>
                  <CardDescription>
                    Lista completa de usuários com filtros aplicados
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {users
                      .filter(user => {
                        const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            user.email.toLowerCase().includes(searchTerm.toLowerCase())
                        const matchesRole = filterRole === 'all' || user.roles?.includes(filterRole)
                        const matchesStatus = filterStatus === 'all' || user.status === filterStatus
                        return matchesSearch && matchesRole && matchesStatus
                      })
                      .map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-blue-600">
                                {user.name.split(' ').map((n: string) => n[0]).join('')}
                              </span>
                            </div>
                            <div>
                              <h3 className="font-medium">{user.name}</h3>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                              <div className="flex gap-2 mt-1">
                                {user.roles?.map((role: string) => (
                                  <Badge key={role} variant="outline" className="text-xs">
                                    {role}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={user.status === 'active' ? 'default' : 
                                       user.status === 'pending' ? 'secondary' : 'outline'}
                            >
                              {user.status}
                            </Badge>
                            <Button variant="outline" size="sm" onClick={() => openUserSettings(user)}>
                              <Settings className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              {/* Grade de Horários */}
              {canManageSchedule && (
                <ScheduleGrid users={users} currentUser={user || undefined} />
              )}
            </>
          )}
        </TabsContent>

        {/* Tab Projetos */}
        <TabsContent value="projects" className="space-y-6">
          {canManageProjects ? (
            <AdminProjectManagement 
              projects={projects}
              users={users}
              tasks={tasks}
              sessions={sessions}
              onProjectUpdate={() => {
                // Recarregar dados se necessário
                console.log('Projeto atualizado')
              }}
            />
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Acesso Restrito</h3>
                  <p className="text-muted-foreground">
                    Você não tem permissão para gerenciar projetos.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab Horas */}
        <TabsContent value="hours" className="space-y-6">
          <AdminHoursManagement 
            users={users}
            projects={projects}
            sessions={sessions}
          />
        </TabsContent>

        {/* Tab Tarefas */}
        <TabsContent value="tasks" className="space-y-6">
          {canManageTasks && (
            <>
              {/* Filtros */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Gestão de Tarefas
                  </CardTitle>
                  <CardDescription>
                    Visualize, filtre e aprove tarefas em revisão
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Select value={taskStatusFilter} onValueChange={setTaskStatusFilter}>
                      <SelectTrigger className="w-full sm:w-44">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os status</SelectItem>
                        <SelectItem value="to-do">A Fazer</SelectItem>
                        <SelectItem value="in-progress">Em Andamento</SelectItem>
                        <SelectItem value="in-review">Em Revisão</SelectItem>
                        <SelectItem value="adjust">Ajustes</SelectItem>
                        <SelectItem value="done">Concluído</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={taskProjectFilter} onValueChange={setTaskProjectFilter}>
                      <SelectTrigger className="w-full sm:w-52">
                        <SelectValue placeholder="Projeto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os projetos</SelectItem>
                        <SelectItem value="global">Globais</SelectItem>
                        {projects.map((p: any) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Lista de tarefas */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Tarefas</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {liveTasks.filter((task) => {
                        const matchStatus = taskStatusFilter === "all" || task.status === taskStatusFilter
                        const matchProject = taskProjectFilter === "all"
                          || (taskProjectFilter === "global" && task.isGlobal)
                          || (!task.isGlobal && String(task.projectId) === taskProjectFilter)
                        return matchStatus && matchProject
                      }).length} tarefa(s)
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[480px] overflow-y-auto divide-y">
                    {liveTasks
                      .filter((task) => {
                        const matchStatus = taskStatusFilter === "all" || task.status === taskStatusFilter
                        const matchProject = taskProjectFilter === "all"
                          || (taskProjectFilter === "global" && task.isGlobal)
                          || (!task.isGlobal && String(task.projectId) === taskProjectFilter)
                        return matchStatus && matchProject
                      })
                      .map((task) => {
                        const project = projects.find((p: any) => p.id === task.projectId)
                        const isInReview = task.status === "in-review"
                        const isLoading = taskActionLoading === task.id

                        return (
                          <div key={task.id} className="flex items-start justify-between p-4 gap-4">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium truncate">{task.title}</h3>
                              {task.description && (
                                <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{task.description}</p>
                              )}
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  {task.status === "to-do" ? "A Fazer"
                                    : task.status === "in-progress" ? "Em Andamento"
                                    : task.status === "in-review" ? "Em Revisão"
                                    : task.status === "adjust" ? "Ajustes"
                                    : task.status === "done" ? "Concluído"
                                    : task.status}
                                </Badge>
                                <Badge variant="outline" className="text-xs">{task.priority}</Badge>
                                {task.isGlobal && <Badge className="text-xs">Global</Badge>}
                                {project && (
                                  <Badge variant="secondary" className="text-xs">{project.name}</Badge>
                                )}
                              </div>
                            </div>
                            {isInReview && (
                              <div className="flex gap-2 shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-700 border-green-300 hover:bg-green-50 gap-1"
                                  disabled={isLoading}
                                  onClick={async () => {
                                    if (inFlightTaskIds.current.has(task.id)) return
                                    inFlightTaskIds.current.add(task.id)
                                    setTaskActionLoading(task.id)
                                    try {
                                      await approveTask(task.id)
                                    } catch {
                                      await fetchTasks()
                                    } finally {
                                      inFlightTaskIds.current.delete(task.id)
                                      setTaskActionLoading(null)
                                    }
                                  }}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  Aprovar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-700 border-red-300 hover:bg-red-50 gap-1"
                                  disabled={isLoading}
                                  onClick={async () => {
                                    if (inFlightTaskIds.current.has(task.id)) return
                                    inFlightTaskIds.current.add(task.id)
                                    setTaskActionLoading(task.id)
                                    try {
                                      await rejectTask(task.id)
                                    } catch {
                                      await fetchTasks()
                                    } finally {
                                      inFlightTaskIds.current.delete(task.id)
                                      setTaskActionLoading(null)
                                    }
                                  }}
                                >
                                  <XCircle className="h-4 w-4" />
                                  Rejeitar
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    {liveTasks.filter((task) => {
                      const matchStatus = taskStatusFilter === "all" || task.status === taskStatusFilter
                      const matchProject = taskProjectFilter === "all"
                        || (taskProjectFilter === "global" && task.isGlobal)
                        || (!task.isGlobal && String(task.projectId) === taskProjectFilter)
                      return matchStatus && matchProject
                    }).length === 0 && (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        Nenhuma tarefa encontrada para os filtros selecionados.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Tarefas Globais */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Tarefas Globais — Progresso por Usuário</CardTitle>
                  <CardDescription>
                    Progresso de conclusão por usuário em quests globais
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[400px] overflow-y-auto divide-y">
                    {loadingGlobalTasks ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">Carregando progresso...</p>
                    ) : globalTasksProgress.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma tarefa global cadastrada.</p>
                    ) : (
                      globalTasksProgress.map((task) => (
                        <div key={task.id} className="p-4 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{task.title}</p>
                              {task.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>
                              )}
                            </div>
                            <Badge variant="outline" className="shrink-0 text-xs">
                              {task.completedCount}/{task.audienceSize} concluíram
                            </Badge>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-green-600 h-1.5 rounded-full"
                              style={{ width: `${Math.round(task.completionRate)}%` }}
                            />
                          </div>
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span>✓ {task.completedUsers.map((u: any) => u.name).join(", ") || "Ninguém"}</span>
                            <span>⏳ {task.pendingUsers.map((u: any) => u.name).join(", ") || "Nenhum"}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Tab Notificações */}
        <TabsContent value="notifications" className="space-y-6">
          <AdminNotificationsCenter users={users} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Minha Caixa de Notificações
              </CardTitle>
              <CardDescription>
                Visualize e gerencie suas notificações pessoais
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NotificationsPanel />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Badges */}
        <TabsContent value="badges" className="space-y-6">
          {canManageBadges && <BadgeManager />}
        </TabsContent>

        {/* Tab Configurações */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configurações do Sistema
              </CardTitle>
              <CardDescription>
                Configure parâmetros gerais do sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Configurações Gerais</h3>
                  <p className="text-sm text-muted-foreground">
                    Configurações básicas do sistema em desenvolvimento...
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selectedUserForSettings)} onOpenChange={(open) => !open && setSelectedUserForSettings(null)}>
        <DialogContent className="max-w-lg" style={{ maxHeight: "90vh", overflowY: "auto" }}>
          <DialogHeader>
            <DialogTitle>Configurar Usuário</DialogTitle>
            <DialogDescription>
              Gerencie perfil, funções, pontos e status do usuário.
            </DialogDescription>
          </DialogHeader>
          {selectedUserForSettings && (
            <div className="space-y-5">

              {/* Perfil */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-semibold">Perfil</Label>
                </div>
                <div className="space-y-2 pl-6">
                  <div className="space-y-1">
                    <Label htmlFor="userName" className="text-xs">Nome</Label>
                    <Input
                      id="userName"
                      value={userNameDraft}
                      onChange={(e) => setUserNameDraft(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="userEmail" className="text-xs">Email</Label>
                    <Input
                      id="userEmail"
                      type="email"
                      value={userEmailDraft}
                      onChange={(e) => setUserEmailDraft(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="userBio" className="text-xs">Bio</Label>
                    <Textarea
                      id="userBio"
                      value={userBioDraft}
                      onChange={(e) => setUserBioDraft(e.target.value)}
                      placeholder="Biografia do usuário..."
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* Funções */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-semibold">Funções</Label>
                </div>
                <div className="space-y-2 pl-6">
                  {availableRoles.map((role) => (
                    <div key={role.value} className="flex items-start space-x-2">
                      <Checkbox
                        id={role.value}
                        checked={userRolesDraft.includes(role.value)}
                        onCheckedChange={() => handleRoleToggle(role.value)}
                      />
                      <div className="flex-1">
                        <Label htmlFor={role.value} className="text-sm font-medium cursor-pointer">
                          {role.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">{role.description}</p>
                      </div>
                    </div>
                  ))}
                  {userRolesDraft.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {userRolesDraft.map((role) => {
                        const roleInfo = availableRoles.find(r => r.value === role)
                        return (
                          <Badge key={role} variant="secondary" className="text-xs">
                            {roleInfo?.label || role}
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Carga Horária */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-semibold">Carga Horária</Label>
                </div>
                <div className="pl-6">
                  <Label htmlFor="weekHours" className="text-xs">Horas por semana (0–168)</Label>
                  <Input
                    id="weekHours"
                    type="number"
                    min="0"
                    max="168"
                    step="0.5"
                    value={userWeekHoursDraft}
                    onChange={(e) => setUserWeekHoursDraft(e.target.value)}
                  />
                </div>
              </div>

              {/* Pontos */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-semibold">Pontos</Label>
                </div>
                <div className="pl-6">
                  <div className="flex gap-2">
                    <Select value={userPointsAction} onValueChange={(v) => setUserPointsAction(v as "set" | "add" | "remove")}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="set">Definir</SelectItem>
                        <SelectItem value="add">Adicionar</SelectItem>
                        <SelectItem value="remove">Remover</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      value={userPointsValue}
                      onChange={(e) => setUserPointsValue(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Atual: {selectedUserForSettings.points ?? 0} pontos
                  </p>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-semibold">Status</Label>
                </div>
                <div className="flex flex-wrap gap-2 pl-6">
                  <Button variant="outline" size="sm" onClick={() => updateUserStatus(selectedUserForSettings.id, "approve")}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Aprovar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => updateUserStatus(selectedUserForSettings.id, "activate")}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Ativar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    if (confirm("Tem certeza que deseja suspender este usuário?")) {
                      updateUserStatus(selectedUserForSettings.id, "suspend")
                    }
                  }}>
                    <AlertTriangle className="h-3 w-3 mr-1" /> Suspender
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => {
                    if (confirm("Tem certeza que deseja rejeitar este usuário? Esta ação irá removê-lo do sistema.")) {
                      updateUserStatus(selectedUserForSettings.id, "reject")
                    }
                  }}>
                    <XCircle className="h-3 w-3 mr-1" /> Rejeitar
                  </Button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setSelectedUserForSettings(null)}>Cancelar</Button>
                <Button onClick={saveUserSettings} disabled={savingUserSettings}>
                  {savingUserSettings ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CreateUserDialog
        open={createUserOpen}
        onOpenChange={setCreateUserOpen}
        onCreated={handleRefresh}
      />
    </div>
  )
}
