"use client"

import { useState, useEffect } from "react"
import { useIssues } from "@/contexts/issue-context"
import { useAuth } from "@/contexts/auth-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  User, 
  Plus,
  Filter,
  RefreshCw,
  MessageSquare
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Issue } from "@/contexts/types"
import { hasAccess } from "@/lib/utils/access-control"

interface IssueManagementProps {
  className?: string
}

export function IssueManagement({ className }: IssueManagementProps) {
  const { user } = useAuth()
  const {
    issues,
    loading,
    error,
    fetchIssues,
    assignIssue,
    updateIssueStatus,
    resolveIssue,
    getAssignedIssues,
    getOpenIssues,
    deleteIssue,
  } = useIssues()

  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
  const [showResolveDialog, setShowResolveDialog] = useState(false)
  const [resolution, setResolution] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")

  useEffect(() => {
    if (user) {
      fetchIssues()
    }
  }, [user, fetchIssues])

  const filteredIssues = issues.filter(issue => {
    const statusMatch = statusFilter === "all" || issue.status === statusFilter
    const priorityMatch = priorityFilter === "all" || issue.priority === priorityFilter
    return statusMatch && priorityMatch
  })

  const myAssignedIssues = user ? getAssignedIssues(user.id) : []
  const openIssues = getOpenIssues()

  const handleDeleteIssue = async (issueId: number) => {
    //TODO: Validar se o usuário é coordenador ou gerente
    if(!(user.roles.includes("COORDENADOR") || user.roles.includes("GERENTE"))){
      alert("Apenas coordenadores ou gerentes podem remover reclamações!");
      return;
    }

    await deleteIssue(issueId);

    return;
  }

  const handleAssignToMe = async (issueId: number) => {
    if (!user) return
    
    try {
      await assignIssue(issueId, user.id)
    } catch (error) {
      console.error("Error assigning issue:", error)
    }
  }

  const handleResolveIssue = async () => {
    if (!selectedIssue || !resolution.trim()) return

    try {
      await resolveIssue(selectedIssue.id, resolution)
      setShowResolveDialog(false)
      setSelectedIssue(null)
      setResolution("")
    } catch (error) {
      console.error("Error resolving issue:", error)
    }
  }

  const handleUpdateStatus = async (issueId: number, newStatus: string) => {
    try {
      await updateIssueStatus(issueId, newStatus)
    } catch (error) {
      console.error("Error updating issue status:", error)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "destructive"
      case "medium": return "default"
      case "low": return "secondary"
      default: return "outline"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "destructive"
      case "in_progress": return "default"
      case "resolved": return "secondary"
      case "closed": return "outline"
      default: return "outline"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "open": return "Aberto"
      case "in_progress": return "Em Progresso"
      case "resolved": return "Resolvido"
      case "closed": return "Fechado"
      default: return status
    }
  }

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case "high": return "Alta"
      case "medium": return "Média"
      case "low": return "Baixa"
      default: return priority
    }
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>Carregando Reclamações...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5" />
                <span>Gerenciamento de Reclamações</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Gerencie e resolva reclamações do laboratório
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchIssues()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="open">Abertos</SelectItem>
                  <SelectItem value="in_progress">Em Progresso</SelectItem>
                  <SelectItem value="resolved">Resolvidos</SelectItem>
                  <SelectItem value="closed">Fechados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium">Reclamações Abertas</span>
                </div>
                <p className="text-2xl font-bold text-red-600">{openIssues.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Atribuídas a Mim</span>
                </div>
                <p className="text-2xl font-bold text-blue-600">{myAssignedIssues.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Total</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{issues.length}</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {filteredIssues.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma reclamação encontrada com os filtros aplicados.</p>
              </div>
            ) : (
              filteredIssues.map((issue) => (
                <Card key={issue.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="font-semibold text-lg">{issue.title}</h3>
                          <Badge variant={getPriorityColor(issue.priority)}>
                            {getPriorityText(issue.priority)}
                          </Badge>
                          <Badge variant={getStatusColor(issue.status)}>
                            {getStatusText(issue.status)}
                          </Badge>
                        </div>
                        
                        <p className="text-muted-foreground mb-3">{issue.description}</p>
                        
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          <div className="flex items-center space-x-1">
                            <User className="h-4 w-4" />
                            <span>Reportado por: {issue.reporter?.name || issue.reporterId}</span>
                          </div>
                          {issue.assigneeId && (
                            <div className="flex items-center space-x-1">
                              <User className="h-4 w-4" />
                              <span>Atribuído a: {issue.assignee?.name || issue.assigneeId}</span>
                            </div>
                          )}
                          <div className="flex items-center space-x-1">
                            <Clock className="h-4 w-4" />
                            <span>
                              {formatDistanceToNow(new Date(issue.createdAt), { 
                                addSuffix: true, 
                                locale: ptBR 
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col space-y-2 ml-4">
                        {issue.status === "open" && user && (
                          <Button
                            size="sm"
                            onClick={() => handleAssignToMe(issue.id)}
                            disabled={issue.assigneeId === user.id}
                          >
                            {issue.assigneeId === user.id ? "Atribuído a Mim" : "Atribuir a Mim"}
                          </Button>
                        )}

                        {issue.assigneeId === user?.id && issue.status === "open" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateStatus(issue.id, "in_progress")}
                          >
                            Iniciar Trabalho
                          </Button>
                        )}

                        {issue.assigneeId === user?.id && issue.status === "in_progress" && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedIssue(issue)
                              setShowResolveDialog(true)
                            }}
                          >
                            Resolver Reclamação
                            </Button>
                        )}

                        {issue.status === "resolved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateStatus(issue.id, "closed")}
                          >
                            Fechar
                          </Button>
                        )}

                        { hasAccess(user.roles, "MANAGE_USERS") &&
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteIssue(issue.id)}
                        >
                          Cancelar
                        </Button>

                        } 
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resolve Reclamação Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver Reclamação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium mb-2">{selectedIssue?.title}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {selectedIssue?.description}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Descrição da Resolução
              </label>
              <Textarea
                placeholder="Descreva como a issue foi resolvida..."
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleResolveIssue}
              disabled={!resolution.trim()}
            >
              Resolver Reclamação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
