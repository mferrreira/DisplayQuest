"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useProject } from "@/contexts/project-context"
import { UsersAPI } from "@/contexts/api-client"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useToast } from "@/contexts/use-toast"
import { 
  UserCheck, 
  UserX, 
  Clock, 
  Users, 
  Target,
  AlertTriangle,
  CheckCircle
} from "lucide-react"

interface PendingUser {
  id: number
  name: string
  email: string
  roles: string[]
  weekHours: number
  createdAt: string
}

interface UserApprovalDialogProps {
  user: PendingUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onApproved: () => void
}

export function UserApprovalDialog({ user, open, onOpenChange, onApproved }: UserApprovalDialogProps) {
  const { user: currentUser } = useAuth()
  const { projects } = useProject()
  const { toast } = useToast()
  
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [weekHours, setWeekHours] = useState<number>(20)
  const [selectedProjectId, setSelectedProjectId] = useState<string>("none")
  const [processing, setProcessing] = useState(false)

  // Reset form when user changes
  useEffect(() => {
    if (user && open) {
      setSelectedRoles([])
      setWeekHours(20)
      setSelectedProjectId("")
    }
  }, [user, open])

  const availableRoles = [
    { value: 'VOLUNTARIO', label: 'Voluntário', description: 'Acesso básico ao sistema' },
    { value: 'COLABORADOR', label: 'Colaborador', description: 'Pode trabalhar em projetos' },
    { value: 'PESQUISADOR', label: 'Pesquisador', description: 'Acesso a funcionalidades de pesquisa' },
    { value: 'GERENTE_PROJETO', label: 'Gerente de Projeto', description: 'Gerencia projetos específicos' },
    { value: 'LABORATORISTA', label: 'Laboratorista', description: 'Acesso administrativo' },
    { value: 'GERENTE', label: 'Gerente', description: 'Acesso total ao sistema' },
    { value: 'COORDENADOR', label: 'Coordenador', description: 'Acesso completo e gestão de usuários' }
  ]

  const handleRoleToggle = (role: string) => {
    setSelectedRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    )
  }

  const handleApprove = async () => {
    if (!user) return

    if (selectedRoles.length === 0) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos uma função para o usuário",
        variant: "destructive"
      })
      return
    }

    if (weekHours < 0 || weekHours > 168) {
      toast({
        title: "Erro",
        description: "Carga horária deve estar entre 0 e 168 horas",
        variant: "destructive"
      })
      return
    }

    try {
      setProcessing(true)
      
      // Aprovar o usuário com as configurações
      await UsersAPI.approveUser(user.id)
      
      // Atualizar roles do usuário
      await UsersAPI.updateUserRoles(user.id, selectedRoles)
      
      // Atualizar carga horária
      await UsersAPI.updateUserWeekHours(user.id, weekHours)
      
      // Se um projeto foi selecionado, adicionar o usuário ao projeto
      if (selectedProjectId && selectedProjectId !== "none") {
        await UsersAPI.addUserToProject(user.id, parseInt(selectedProjectId))
      }

      toast({
        title: "Sucesso",
        description: `${user.name} foi aprovado com sucesso!`,
      })

      onApproved()
      onOpenChange(false)
    } catch (error) {
      console.error("Erro ao aprovar usuário:", error)
      toast({
        title: "Erro",
        description: "Não foi possível aprovar o usuário",
        variant: "destructive"
      })
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!user) return

    try {
      setProcessing(true)
      await UsersAPI.rejectPendingUser(user.id)
      
      toast({
        title: "Usuário rejeitado",
        description: `${user.name} foi rejeitado e removido do sistema`,
      })

      onApproved()
      onOpenChange(false)
    } catch (error) {
      console.error("Erro ao rejeitar usuário:", error)
      toast({
        title: "Erro",
        description: "Não foi possível rejeitar o usuário",
        variant: "destructive"
      })
    } finally {
      setProcessing(false)
    }
  }

  if (!user) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh]" style={{ overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Aprovar Usuário
          </DialogTitle>
          <DialogDescription>
            Configure as permissões e informações do usuário antes de aprovar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações do Usuário */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Informações do Usuário
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="text-lg">
                    {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{user.name}</h3>
                  <p className="text-muted-foreground">{user.email}</p>
                  <p className="text-sm text-muted-foreground">
                    Solicitou acesso em {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <Badge variant="outline" className="bg-yellow-100 dark:bg-warning/15 text-yellow-800 dark:text-yellow-300">
                  Pendente
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Seleção de Funções */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Funções do Usuário
              </CardTitle>
              <CardDescription>
                Selecione uma ou mais funções para o usuário
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {availableRoles.map((role) => (
                  <div key={role.value} className="flex items-start space-x-3">
                    <Checkbox
                      id={role.value}
                      checked={selectedRoles.includes(role.value)}
                      onCheckedChange={() => handleRoleToggle(role.value)}
                    />
                    <div className="flex-1">
                      <Label htmlFor={role.value} className="font-medium">
                        {role.label}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {role.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {selectedRoles.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 dark:bg-info/10 rounded-lg">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">Funções selecionadas:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedRoles.map((role) => {
                      const roleInfo = availableRoles.find(r => r.value === role)
                      return (
                        <Badge key={role} variant="secondary">
                          {roleInfo?.label}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Carga Horária */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Carga Horária
              </CardTitle>
              <CardDescription>
                Defina a carga horária semanal do usuário
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="weekHours">Horas por semana</Label>
                <Input
                  id="weekHours"
                  type="number"
                  min="0"
                  max="168"
                  value={weekHours}
                  onChange={(e) => setWeekHours(Number(e.target.value))}
                  placeholder="Ex: 20"
                />
                <p className="text-sm text-muted-foreground">
                  Valor entre 0 e 168 horas (tempo total de uma semana)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Projeto (Opcional) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Projeto (Opcional)
              </CardTitle>
              <CardDescription>
                Adicione o usuário a um projeto específico
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="project">Projeto</Label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um projeto (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum projeto</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  O usuário pode ser adicionado a um projeto posteriormente
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Aviso de Confirmação */}
          <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-warning/10 border border-yellow-200 dark:border-warning/25 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-warning mt-0.5" />
            <div>
              <p className="font-medium text-yellow-900 dark:text-yellow-300">Confirmação necessária</p>
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                Após aprovar, o usuário receberá acesso ao sistema com as configurações definidas. 
                Esta ação não pode ser desfeita facilmente.
              </p>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={processing}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={processing}
          >
            <UserX className="h-4 w-4 mr-2" />
            Rejeitar
          </Button>
          <Button
            onClick={handleApprove}
            disabled={processing || selectedRoles.length === 0}
          >
            <UserCheck className="h-4 w-4 mr-2" />
            {processing ? "Processando..." : "Aprovar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
