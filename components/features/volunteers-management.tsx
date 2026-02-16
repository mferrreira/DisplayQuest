"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { 
  Users, 
  UserPlus, 
  Clock, 
  CheckCircle2, 
  Award, 
  Search,
  Filter,
  MoreHorizontal,
  Mail,
  Phone,
  Calendar,
  TrendingUp,
  Target,
  Minus
} from "lucide-react"
import { Project, ProjectMember } from "@/contexts/types"
import { useProject } from "@/contexts/project-context"
import { useAuth } from "@/contexts/auth-context"
import { VolunteerActions } from "./volunteer-actions"
import { DeductHoursDialog } from "./deduct-hours-dialog"
import { fetchAPI } from "@/contexts/api-client"
import { ProjectMembersManagement } from "./project-members-management"
import { ProjectHoursStats } from "./project-hours-stats"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/contexts/use-toast"

interface VolunteerStats {
  totalVolunteers: number
  totalHours: number
  completedTasks: number
  totalPoints: number
}

interface Volunteer {
  id: number
  name: string
  email: string
  avatar?: string | null
  role: string
  joinedAt: string
  hoursWorked: number
  tasksCompleted: number
  pointsEarned: number
  status: 'active' | 'inactive' | 'on_leave'
  lastActivity: string
}

interface ProjectVolunteersResponse {
  success?: boolean
  volunteers: Volunteer[]
  stats: VolunteerStats
}

export function VolunteersManagement() {
  const { projects, loading: projectsLoading } = useProject()
  const { user } = useAuth()
  const { toast } = useToast()
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [stats, setStats] = useState<VolunteerStats>({
    totalVolunteers: 0,
    totalHours: 0,
    completedTasks: 0,
    totalPoints: 0
  })
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [showManagementDialog, setShowManagementDialog] = useState(false)

  // Filtrar projetos baseado no usuário
  const availableProjects = projects.filter(project => {
    if (!user?.roles) return false
    
    // Coordenadores e Gerentes veem todos os projetos
    if (user.roles.includes('COORDENADOR') || user.roles.includes('GERENTE')) {
      return true
    }
    
    // Gerentes de Projeto veem apenas seus projetos
    if (user.roles.includes('GERENTE_PROJETO')) {
      return project.leaderId === user.id || project.members?.some((member: ProjectMember) => member.userId === user.id)
    }
    
    return false
  })

  // Selecionar primeiro projeto automaticamente se houver apenas um
  useEffect(() => {
    if (availableProjects.length === 1 && !selectedProjectId) {
      setSelectedProjectId(availableProjects[0].id)
    }
  }, [availableProjects, selectedProjectId])

  // Carregar dados do projeto selecionado
  useEffect(() => {
    if (selectedProjectId) {
      loadProjectData(selectedProjectId)
    }
  }, [selectedProjectId])

  const loadProjectData = async (projectId: number) => {
    setLoading(true)
    try {
      // Buscar dados reais via API
      const response = await fetchAPI<ProjectVolunteersResponse>(`/api/projects/${projectId}/volunteers`)
      
      if (Array.isArray(response.volunteers)) {
        setVolunteers(response.volunteers)
        setStats(response.stats)
      } else {
        // Fallback para dados do projeto local
        const project = projects.find(p => p.id === projectId)
        if (project) {
          const volunteers: Volunteer[] = project.members?.map((member: ProjectMember) => ({
            id: member.userId,
            name: member.user?.name || 'Usuário',
            email: member.user?.email || '',
            avatar: member.user?.avatar,
            role: member.roles?.[0] || 'COLABORADOR',
            joinedAt: member.joinedAt,
            hoursWorked: 0,
            tasksCompleted: 0,
            pointsEarned: 0,
            status: 'active' as const,
            lastActivity: new Date().toISOString().split('T')[0]
          })) || []

          setVolunteers(volunteers)
          setStats({
            totalVolunteers: volunteers.length,
            totalHours: 0,
            completedTasks: 0,
            totalPoints: 0
          })
        } else {
          setVolunteers([])
          setStats({
            totalVolunteers: 0,
            totalHours: 0,
            completedTasks: 0,
            totalPoints: 0
          })
        }
      }
    } catch (error) {
      console.error("Erro ao carregar dados do projeto:", error)
      // Fallback em caso de erro
      setVolunteers([])
      setStats({
        totalVolunteers: 0,
        totalHours: 0,
        completedTasks: 0,
        totalPoints: 0
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredVolunteers = volunteers.filter(volunteer => {
    const matchesSearch = volunteer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         volunteer.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || volunteer.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800">Ativo</Badge>
      case 'inactive':
        return <Badge variant="secondary">Inativo</Badge>
      case 'on_leave':
        return <Badge variant="outline" className="border-yellow-200 text-yellow-800">Afastado</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando projetos...</p>
        </div>
      </div>
    )
  }

  if (availableProjects.length === 0) {
    return (
      <div className="text-center py-8">
        <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">Nenhum projeto disponível</h3>
        <p className="text-muted-foreground">
          Você não tem permissão para gerenciar voluntários em nenhum projeto.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Seletor de Projeto */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Selecionar Projeto
          </CardTitle>
          <CardDescription>
            Escolha o projeto para gerenciar os voluntários
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select 
              value={selectedProjectId?.toString() || ""} 
              onValueChange={(value) => setSelectedProjectId(parseInt(value))}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedProjectId && (
              <div className="text-sm text-muted-foreground">
                Projeto selecionado: {availableProjects.find(p => p.id === selectedProjectId)?.name}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedProjectId && (
        <>
          {/* Header com Ações */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Gerenciamento de Voluntários</h2>
              <p className="text-muted-foreground">
                Gerencie a equipe e acompanhe o desempenho dos voluntários
              </p>
            </div>
            <Dialog open={showManagementDialog} onOpenChange={setShowManagementDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Users className="h-4 w-4 mr-2" />
                  Gestão Completa
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[90vh]">
                <DialogHeader>
                  <DialogTitle>Gestão Completa do Projeto</DialogTitle>
                  <DialogDescription>
                    Gerencie membros, horas e estatísticas do projeto {availableProjects.find(p => p.id === selectedProjectId)?.name}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 overflow-y-auto max-h-[70vh] pr-2">
                  {selectedProjectId && (
                    <>
                      <ProjectHoursStats project={availableProjects.find(p => p.id === selectedProjectId)!} />
                      <ProjectMembersManagement 
                        project={availableProjects.find(p => p.id === selectedProjectId)!} 
                        onUpdate={() => {
                          toast({
                            title: "Sucesso",
                            description: "Projeto atualizado com sucesso!",
                          })
                        }} 
                      />
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Ações de Gerenciamento */}
          <Card>
            <CardHeader>
              <CardTitle>Ações de Gerenciamento</CardTitle>
              <CardDescription>
                Adicione ou remova voluntários do projeto
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VolunteerActions 
                projectId={selectedProjectId}
                onVolunteerAdded={() => {
                  // Recarregar dados do projeto
                  loadProjectData(selectedProjectId)
                }}
                onVolunteerRemoved={() => {
                  // Recarregar dados do projeto
                  loadProjectData(selectedProjectId)
                }}
              />
            </CardContent>
          </Card>

          {/* Cards de Estatísticas */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Voluntários</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalVolunteers}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.totalVolunteers > 0 ? 'Voluntários ativos' : 'Nenhum voluntário'}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Horas Trabalhadas</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalHours}h</div>
                <p className="text-xs text-muted-foreground">
                  Horas trabalhadas
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tasks Completadas</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.completedTasks}</div>
                <p className="text-xs text-muted-foreground">
                  Tasks completadas
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pontos Conquistados</CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalPoints}</div>
                <p className="text-xs text-muted-foreground">
                  Pontos conquistados
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filtros e Busca */}
          <Card>
            <CardHeader>
              <CardTitle>Equipe de Voluntários</CardTitle>
              <CardDescription>
                Gerencie e acompanhe o desempenho da sua equipe
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar voluntários..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 w-full border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                    <SelectItem value="on_leave">Afastado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Lista de Voluntários */}
              <div className="space-y-4">
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Carregando voluntários...</p>
                  </div>
                ) : filteredVolunteers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Nenhum voluntário encontrado</h3>
                    <p className="text-sm">
                      {searchTerm || statusFilter !== "all" 
                        ? "Tente ajustar os filtros de busca"
                        : "Este projeto ainda não possui voluntários"
                      }
                    </p>
                  </div>
                ) : (
                  filteredVolunteers.map((volunteer) => (
                    <Card key={volunteer.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={volunteer.avatar || undefined} />
                              <AvatarFallback>
                                {volunteer.name.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <h3 className="font-semibold">{volunteer.name}</h3>
                              <p className="text-sm text-muted-foreground">{volunteer.email}</p>
                              <p className="text-sm text-muted-foreground">{volunteer.role}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-6">
                            <div className="text-center">
                              <p className="text-sm font-medium">{volunteer.hoursWorked}h</p>
                              <p className="text-xs text-muted-foreground">Horas</p>
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-medium">{volunteer.tasksCompleted}</p>
                              <p className="text-xs text-muted-foreground">Tasks</p>
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-medium">{volunteer.pointsEarned}</p>
                              <p className="text-xs text-muted-foreground">Pontos</p>
                            </div>
                            <div className="text-center">
                              {getStatusBadge(volunteer.status)}
                            </div>
                            <div className="flex items-center gap-2">
                              <DeductHoursDialog
                                userId={volunteer.id}
                                userName={volunteer.name}
                                currentHours={volunteer.hoursWorked}
                                projectId={selectedProjectId}
                                onHoursDeducted={() => loadProjectData(selectedProjectId)}
                              >
                                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                                  <Minus className="h-4 w-4" />
                                </Button>
                              </DeductHoursDialog>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
