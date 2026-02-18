"use client"

import React, { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { 
  Target, 
  Users, 
  Clock, 
  Settings, 
  Plus, 
  Search, 
  Filter,
  Edit,
  Trash2,
  BarChart3,
  Calendar,
  CheckCircle2,
  AlertCircle
} from "lucide-react"
import { ProjectMembersManagement } from "@/components/features/project-members-management"
import { ProjectHoursStats } from "@/components/features/project-hours-stats"
import { useToast } from "@/contexts/use-toast"

interface AdminProjectManagementProps {
  projects: any[]
  users: any[]
  tasks: any[]
  sessions: any[]
  onProjectUpdate?: () => void
}

export function AdminProjectManagement({ projects, users, tasks, sessions, onProjectUpdate }: AdminProjectManagementProps) {
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedProject, setSelectedProject] = useState<any>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    status: "active",
    leaderId: ""
  })

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || project.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleCreateProject = async () => {
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectForm)
      })

      if (response.ok) {
        toast({
          title: "Sucesso",
          description: "Projeto criado com sucesso!",
        })
        setShowCreateDialog(false)
        setProjectForm({ name: "", description: "", status: "active", leaderId: "" })
        onProjectUpdate?.()
      } else {
        const data = await response.json()
        toast({
          title: "Erro",
          description: data.error || "Erro ao criar projeto",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao criar projeto",
        variant: "destructive"
      })
    }
  }

  const handleEditProject = async () => {
    if (!selectedProject) return

    try {
      const response = await fetch(`/api/projects/${selectedProject.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectForm)
      })

      if (response.ok) {
        toast({
          title: "Sucesso",
          description: "Projeto atualizado com sucesso!",
        })
        setShowEditDialog(false)
        setSelectedProject(null)
        onProjectUpdate?.()
      } else {
        const data = await response.json()
        toast({
          title: "Erro",
          description: data.error || "Erro ao atualizar projeto",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao atualizar projeto",
        variant: "destructive"
      })
    }
  }

  const handleDeleteProject = async (projectId: number) => {
    if (!confirm("Tem certeza que deseja excluir este projeto? Esta ação não pode ser desfeita.")) {
      return
    }

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        toast({
          title: "Sucesso",
          description: "Projeto excluído com sucesso!",
        })
        onProjectUpdate?.()
      } else {
        const data = await response.json()
        toast({
          title: "Erro",
          description: data.error || "Erro ao excluir projeto",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao excluir projeto",
        variant: "destructive"
      })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'completed': return 'bg-blue-100 text-blue-800'
      case 'paused': return 'bg-yellow-100 text-yellow-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Ativo'
      case 'completed': return 'Concluído'
      case 'paused': return 'Pausado'
      case 'cancelled': return 'Cancelado'
      default: return status
    }
  }

  const calculateProjectProgress = (project: any) => {
    const projectTasks = tasks.filter(t => t.projectId === project.id)
    if (projectTasks.length === 0) return 0
    const completedTasks = projectTasks.filter(t => t.status === 'done').length
    return Math.round((completedTasks / projectTasks.length) * 100)
  }

  const getProjectTotalHours = (projectId: number) => {
    const totalSeconds = (sessions || [])
      .filter((session: any) => session.projectId === projectId && session.status === "completed")
      .reduce((sum: number, session: any) => sum + (session.duration || 0), 0)
    return totalSeconds / 3600
  }

  return (
    <div className="space-y-6">
      {/* Header com filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Gestão de Projetos
          </CardTitle>
          <CardDescription>
            Gerencie todos os projetos do laboratório
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Buscar projetos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="completed">Concluídos</SelectItem>
                <SelectItem value="paused">Pausados</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Projeto
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Novo Projeto</DialogTitle>
                  <DialogDescription>
                    Preencha as informações do novo projeto
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nome do Projeto</Label>
                    <Input
                      id="name"
                      value={projectForm.name}
                      onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                      placeholder="Ex: Sistema de Gestão"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea
                      id="description"
                      value={projectForm.description}
                      onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                      placeholder="Descreva o projeto..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="leader">Líder do Projeto</Label>
                    <Select value={projectForm.leaderId} onValueChange={(value) => setProjectForm({ ...projectForm, leaderId: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um líder" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.filter(u => u.status === 'active').map((user) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateProject} disabled={!projectForm.name}>
                    Criar Projeto
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Lista de projetos */}
      <div className="grid gap-6">
        {filteredProjects.map((project) => {
          const projectTasks = tasks.filter(t => t.projectId === project.id)
          const progress = calculateProjectProgress(project)
          
          return (
            <Card key={project.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {project.name}
                      <Badge className={getStatusColor(project.status)}>
                        {getStatusLabel(project.status)}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {project.description || "Sem descrição"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedProject(project)
                        setShowDetailsDialog(true)
                      }}
                    >
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedProject(project)
                        setProjectForm({
                          name: project.name,
                          description: project.description || "",
                          status: project.status,
                          leaderId: project.leaderId?.toString() || ""
                        })
                        setShowEditDialog(true)
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteProject(project.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      <strong>{project.members?.length || 0}</strong> membros
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      <strong>{projectTasks.length}</strong> tarefas
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      <strong>{getProjectTotalHours(project.id).toFixed(1)}h</strong> trabalhadas
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      Criado em {new Date(project.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
                
                {projectTasks.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progresso das tarefas</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Dialog de detalhes do projeto */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{selectedProject?.name}</DialogTitle>
            <DialogDescription>
              Detalhes completos do projeto
            </DialogDescription>
          </DialogHeader>
          {selectedProject && (
            <div className="space-y-6 overflow-y-auto max-h-[70vh] pr-2">
              <ProjectHoursStats project={selectedProject} />
              <ProjectMembersManagement 
                project={selectedProject} 
                onUpdate={() => {
                  onProjectUpdate?.()
                }} 
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de edição */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Projeto</DialogTitle>
            <DialogDescription>
              Atualize as informações do projeto
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Nome do Projeto</Label>
              <Input
                id="edit-name"
                value={projectForm.name}
                onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                value={projectForm.description}
                onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select value={projectForm.status} onValueChange={(value) => setProjectForm({ ...projectForm, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-leader">Líder do Projeto</Label>
              <Select value={projectForm.leaderId} onValueChange={(value) => setProjectForm({ ...projectForm, leaderId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um líder" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.status === 'active').map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditProject} disabled={!projectForm.name}>
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
