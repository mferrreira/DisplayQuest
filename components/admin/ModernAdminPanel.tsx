"use client"

import React, { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  RefreshCw
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
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
  
  const [searchTerm, setSearchTerm] = useState("")
  const [filterRole, setFilterRole] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [selectedProject, setSelectedProject] = useState<string>("")
  const [refreshing, setRefreshing] = useState(false)

  // Verificar permissões do usuário
  const canManageUsers = hasAccess(user?.roles || [], 'MANAGE_USERS')
  const canManageProjects = hasAccess(user?.roles || [], 'MANAGE_PROJECTS')
  const canManageTasks = hasAccess(user?.roles || [], 'MANAGE_TASKS')
  const canManageSchedule = hasAccess(user?.roles || [], 'MANAGE_SCHEDULE')
  const canManageBadges = hasAccess(user?.roles || [], 'MANAGE_BADGES')

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      // Recarregar dados
      window.location.reload()
    } finally {
      setRefreshing(false)
    }
  }

  const exportData = (type: string) => {
    // Implementar exportação de dados
    console.log(`Exportando dados: ${type}`)
  }

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
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-8">
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
                            <Button variant="outline" size="sm">
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Gestão de Tarefas
                </CardTitle>
                <CardDescription>
                  Gerencie tarefas e aprovações
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {tasks.slice(0, 10).map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-medium">{task.title}</h3>
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline">{task.status}</Badge>
                          <Badge variant="outline">{task.priority}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
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
    </div>
  )
}
