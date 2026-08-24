"use client"

import { useState } from "react"
import { UsersAPI } from "@/contexts/api-client"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/contexts/use-toast"
import { UserPlus, Shield, Clock } from "lucide-react"

interface CreateUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
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

export function CreateUserDialog({ open, onOpenChange, onCreated }: CreateUserDialogProps) {
  const { toast } = useToast()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [weekHours, setWeekHours] = useState<number>(20)
  const [processing, setProcessing] = useState(false)

  const resetForm = () => {
    setName("")
    setEmail("")
    setPassword("")
    setSelectedRoles([])
    setWeekHours(20)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm()
    onOpenChange(nextOpen)
  }

  const handleRoleToggle = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    )
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: "Erro", description: "Nome é obrigatório", variant: "destructive" })
      return
    }
    if (!email.trim()) {
      toast({ title: "Erro", description: "Email é obrigatório", variant: "destructive" })
      return
    }
    if (password.length < 6) {
      toast({ title: "Erro", description: "A senha deve ter pelo menos 6 caracteres", variant: "destructive" })
      return
    }
    if (selectedRoles.length === 0) {
      toast({ title: "Erro", description: "Selecione pelo menos uma função", variant: "destructive" })
      return
    }

    try {
      setProcessing(true)
      await UsersAPI.create({
        name: name.trim(),
        email: email.trim(),
        password,
        roles: selectedRoles,
        weekHours,
      })

      toast({ title: "Sucesso", description: `${name} foi criado com sucesso!` })
      resetForm()
      onCreated()
      onOpenChange(false)
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error?.message || "Não foi possível criar o usuário",
        variant: "destructive",
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh]" style={{ overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Novo Usuário
          </DialogTitle>
          <DialogDescription>
            Crie uma conta ativa diretamente, sem necessidade de auto-registro
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Dados pessoais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados Pessoais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="create-name">Nome</Label>
                <Input
                  id="create-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome completo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-password">Senha</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            </CardContent>
          </Card>

          {/* Funções */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                Funções
              </CardTitle>
              <CardDescription>Selecione uma ou mais funções para o usuário</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {availableRoles.map((role) => (
                  <div key={role.value} className="flex items-start space-x-3">
                    <Checkbox
                      id={`create-${role.value}`}
                      checked={selectedRoles.includes(role.value)}
                      onCheckedChange={() => handleRoleToggle(role.value)}
                    />
                    <div className="flex-1">
                      <Label htmlFor={`create-${role.value}`} className="font-medium">
                        {role.label}
                      </Label>
                      <p className="text-sm text-muted-foreground">{role.description}</p>
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
                      return <Badge key={role} variant="secondary">{roleInfo?.label}</Badge>
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Carga horária */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                Carga Horária
              </CardTitle>
              <CardDescription>Defina a carga horária semanal</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="create-weekHours">Horas por semana</Label>
                <Input
                  id="create-weekHours"
                  type="number"
                  min="0"
                  max="168"
                  value={weekHours}
                  onChange={(e) => setWeekHours(Number(e.target.value))}
                />
                <p className="text-sm text-muted-foreground">Valor entre 0 e 168</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={processing}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={processing}>
            <UserPlus className="h-4 w-4 mr-2" />
            {processing ? "Criando..." : "Criar Usuário"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
