"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/contexts/use-toast"
import { useAuth } from "@/contexts/auth-context"
import {
  Users,
  UserMinus,
  UserPlus,
  Clock,
  Crown,
  MoreHorizontal,
  IdCard,
} from "lucide-react"
import type { Project } from "@/contexts/types"
import {
  MEMBER_CATEGORIES,
  MEMBER_CATEGORY_LABELS,
  MEMBER_SITUATIONS,
  MEMBER_SITUATION_LABELS,
} from "@/backend/domain"
import { formatDateOnly } from "@/lib/date-only"
import {
  type MemberProfilePatch,
  type ProjectMember,
} from "@/lib/api/project-members"
import { useProjectMembers } from "@/hooks/use-project-members"

interface ProjectMembersManagementProps {
  project: Project
  onUpdate?: () => void
  initialMembers?: ProjectMember[]
}

/** Sentinela do Select: "sem valor" não pode ser string vazia no Radix (mesma do V5-4a). */
const NO_VALUE = "none"

/** O rascunho dos dados do vínculo é sempre string: é o que o `Input` carrega. */
interface MemberProfileDraft {
  lattes: string
  cargaHoraria: string
  categoria: string
  situacao: string
  dataEntrada: string
}

function draftFromMember(member: ProjectMember): MemberProfileDraft {
  return {
    lattes: member.lattes ?? "",
    cargaHoraria: member.cargaHoraria === null || member.cargaHoraria === undefined ? "" : String(member.cargaHoraria),
    categoria: member.categoria ?? NO_VALUE,
    situacao: member.situacao ?? "ATIVO",
    dataEntrada: member.dataEntrada ?? "",
  }
}

/** Rótulo do domínio, com fallback ao token: o vocabulário não é inventado aqui (DEC-96). */
const categoryLabel = (categoria: string | null) =>
  (MEMBER_CATEGORY_LABELS as Record<string, string>)[categoria ?? ""] ?? categoria ?? ""

const situationLabel = (situacao: string | null) =>
  (MEMBER_SITUATION_LABELS as Record<string, string>)[situacao ?? ""] ?? situacao ?? ""

/**
 * A linha de leitura de quem não gerencia. Monta só com o que existe: um vínculo sem dado
 * nenhum não ganha linha vazia.
 */
function describeMemberProfile(member: ProjectMember) {
  const parts: string[] = []
  if (member.cargaHoraria) parts.push(`${member.cargaHoraria} h/semana contratadas`)
  if (member.categoria) parts.push(categoryLabel(member.categoria))
  if (member.situacao && member.situacao !== "ATIVO") parts.push(situationLabel(member.situacao))
  if (member.dataEntrada) parts.push(`entrou em ${formatDateOnly(member.dataEntrada)}`)
  if (member.lattes) parts.push(`Lattes ${member.lattes}`)
  return parts.join(" · ")
}

const ROLE_NAMES: Record<string, string> = {
  COORDENADOR: "Coordenador",
  GERENTE: "Gerente",
  GERENTE_PROJETO: "Gerente de Projeto",
  PESQUISADOR: "Pesquisador",
  COLABORADOR: "Colaborador",
  VOLUNTARIO: "Voluntário",
}

const getRoleDisplayName = (role: string) => ROLE_NAMES[role] || role

export function ProjectMembersManagement({ project, onUpdate, initialMembers }: ProjectMembersManagementProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [showHoursDialog, setShowHoursDialog] = useState(false)
  const [showProfileDialog, setShowProfileDialog] = useState(false)
  const [selectedMember, setSelectedMember] = useState<ProjectMember | null>(null)
  const [newMemberUserId, setNewMemberUserId] = useState<string>("")
  const [newMemberRole, setNewMemberRole] = useState<string>("COLABORADOR")
  const [memberRoleDrafts, setMemberRoleDrafts] = useState<Record<number, string>>({})
  const [memberProfileDrafts, setMemberProfileDrafts] = useState<Record<number, MemberProfileDraft>>({})
  const [currentLeaderId, setCurrentLeaderId] = useState<number | null>(project.leaderId ?? null)
  const [leaderSelection, setLeaderSelection] = useState<string>(project.leaderId ? String(project.leaderId) : "none")
  const [manualHours, setManualHours] = useState<number>(0)
  const [hoursDate, setHoursDate] = useState<string>("")

  const canManageMembers = Boolean(
    user?.roles?.includes('COORDENADOR') ||
    user?.roles?.includes('GERENTE') ||
    user?.roles?.includes('GERENTE_PROJETO')
  )
  const {
    members,
    availableUsers,
    loading,
    error: membersError,
    reload,
    addMember,
    removeMember,
    updateMemberRoles,
    updateMemberProfile,
    updateLeader,
  } = useProjectMembers(project.id, { includeAvailableUsers: canManageMembers, initialMembers })

  useEffect(() => {
    const leaderId = project.leaderId ?? null
    setCurrentLeaderId(leaderId)
    setLeaderSelection(leaderId ? String(leaderId) : "none")
  }, [project.id, project.leaderId])

  useEffect(() => {
    setMemberRoleDrafts(
      members.reduce((acc: Record<number, string>, member: ProjectMember) => {
        acc[member.userId] = member.roles?.[0] || "COLABORADOR"
        return acc
      }, {}),
    )
    // Rascunho do vínculo é por id do vínculo (um mesmo usuário pode ter vínculos em projetos
    // diferentes). Recarregar depois de salvar é o que devolve o rascunho ao valor gravado.
    setMemberProfileDrafts(
      members.reduce((acc: Record<number, MemberProfileDraft>, member: ProjectMember) => {
        acc[member.id] = draftFromMember(member)
        return acc
      }, {}),
    )
  }, [members])

  useEffect(() => {
    if (!membersError) return
    toast({
      title: "Erro",
      description: membersError,
      variant: "destructive",
    })
  }, [membersError, toast])

  const handleSetMemberRole = async (member: ProjectMember) => {
    const role = memberRoleDrafts[member.userId]
    if (!role) return

    try {
      await updateMemberRoles(member.userId, [role])
      toast({
        title: "Sucesso",
        description: `Papéis de ${member.userName || `usuário #${member.userId}`} atualizados`,
      })
      onUpdate?.()
    } catch (error) {
      console.error("Erro ao atualizar papel do membro:", error)
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar papel do membro",
        variant: "destructive",
      })
    }
  }

  /**
   * V5-4b (DEC-149): salva só o diff do vínculo. Abrir a tela e salvar não apaga o que a pessoa
   * não tocou — a mesma trava do formulário de perfil, e pela mesma razão: o servidor trata chave
   * ausente como "não mexer".
   */
  const handleSaveMemberProfile = async (member: ProjectMember) => {
    const draft = memberProfileDrafts[member.id] ?? draftFromMember(member)
    const patch: MemberProfilePatch = {}

    const lattes = draft.lattes.trim()
    if (lattes !== (member.lattes ?? "")) patch.lattes = lattes

    const storedCarga =
      member.cargaHoraria === null || member.cargaHoraria === undefined ? "" : String(member.cargaHoraria)
    const carga = draft.cargaHoraria.trim()
    if (carga !== storedCarga) patch.cargaHoraria = carga === "" ? null : Number(carga)

    const categoria = draft.categoria === NO_VALUE ? null : draft.categoria
    if (categoria !== (member.categoria ?? null)) patch.categoria = categoria

    if (draft.situacao !== (member.situacao ?? "ATIVO")) patch.situacao = draft.situacao

    if (draft.dataEntrada !== (member.dataEntrada ?? "")) {
      patch.dataEntrada = draft.dataEntrada === "" ? null : draft.dataEntrada
    }

    if (Object.keys(patch).length === 0) {
      setShowProfileDialog(false)
      return
    }

    try {
      await updateMemberProfile(member.id, patch)
      toast({
        title: "Sucesso",
        description: `Dados de ${member.userName || `usuário #${member.userId}`} atualizados`,
      })
      setShowProfileDialog(false)
      onUpdate?.()
    } catch (error) {
      console.error("Erro ao atualizar dados do membro:", error)
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar dados do membro",
        variant: "destructive",
      })
    }
  }

  const handleSetLeader = async () => {
    const userId = leaderSelection === "none" ? null : Number(leaderSelection)

    if (userId !== null && (!Number.isInteger(userId) || userId <= 0)) {
      toast({
        title: "Erro",
        description: "Selecione um líder válido",
        variant: "destructive",
      })
      return
    }

    try {
      const leader = await updateLeader(userId)
      const leaderId = leader?.leaderId ?? null
      setCurrentLeaderId(leaderId)
      setLeaderSelection(leaderId ? String(leaderId) : "none")
      toast({
        title: "Sucesso",
        description: leaderId ? "Líder do projeto atualizado" : "Líder removido do projeto",
      })
      onUpdate?.()
    } catch (error) {
      console.error("Erro ao definir líder do projeto:", error)
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao definir líder do projeto",
        variant: "destructive",
      })
    }
  }

  const handleAddMember = async () => {
    try {
      await addMember(parseInt(newMemberUserId), [newMemberRole])
      toast({
        title: "Sucesso",
        description: "Membro adicionado ao projeto com sucesso!",
      })
      setShowAddDialog(false)
      setNewMemberUserId("")
      setNewMemberRole("COLABORADOR")
      onUpdate?.()
    } catch (error) {
      console.error('Erro ao adicionar membro:', error)
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao adicionar membro ao projeto",
        variant: "destructive"
      })
    }
  }

  const handleRemoveMember = async () => {
    if (!selectedMember) return

    try {
      await removeMember(selectedMember.id)
      toast({
        title: "Sucesso",
        description: "Membro removido do projeto com sucesso!",
      })
      setShowRemoveDialog(false)
      setSelectedMember(null)
      onUpdate?.()
    } catch (error) {
      console.error('Erro ao remover membro:', error)
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao remover membro do projeto",
        variant: "destructive"
      })
    }
  }

  const handleAddManualHours = async () => {
    if (!selectedMember || !hoursDate || manualHours <= 0) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos corretamente",
        variant: "destructive"
      })
      return
    }

    try {
      const startDate = new Date(`${hoursDate}T09:00:00`)
      const endDate = new Date(startDate.getTime() + manualHours * 60 * 60 * 1000)

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new Error("Data/hora inválida para lançamento manual")
      }

      const response = await fetch('/api/work-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedMember.userId,
          userName: selectedMember.userName || `Usuário #${selectedMember.userId}`,
          activity: "Horas adicionadas manualmente",
          location: "Sistema",
          projectId: project.id,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          status: "completed"
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Sucesso",
          description: `${manualHours}h adicionadas para ${selectedMember.userName}`,
        })
        setShowHoursDialog(false)
        setSelectedMember(null)
        setManualHours(0)
        setHoursDate("")
        reload()
        onUpdate?.()
      } else {
        toast({
          title: "Erro",
          description: data.error || "Erro ao adicionar horas",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Erro ao adicionar horas:', error)
      toast({
        title: "Erro",
        description: "Erro ao adicionar horas manualmente",
        variant: "destructive"
      })
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Membros do Projeto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Carregando membros...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const leaderName = members.find((member) => member.userId === currentLeaderId)?.userName
    || (currentLeaderId ? `Usuário #${currentLeaderId}` : "Sem líder")

  // O dialog de vínculo lê o rascunho por id do vínculo, como fazia o formulário inline.
  const profileMember = canManageMembers ? selectedMember : null
  const profileMemberName = profileMember
    ? profileMember.userName || `usuário #${profileMember.userId}`
    : ""
  const profileDraft = profileMember
    ? memberProfileDrafts[profileMember.id] ?? draftFromMember(profileMember)
    : null
  const patchProfileDraft = (patch: Partial<MemberProfileDraft>) => {
    if (!profileMember) return
    setMemberProfileDrafts((prev) => ({
      ...prev,
      [profileMember.id]: { ...(prev[profileMember.id] ?? draftFromMember(profileMember)), ...patch },
    }))
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Membros do Projeto
          </CardTitle>
          <CardDescription>
            {members.length} membro{members.length !== 1 ? 's' : ''} no projeto
          </CardDescription>
        </div>
        {canManageMembers && (
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Adicionar Membro
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Adicionar Membro ao Projeto</DialogTitle>
                <DialogDescription>
                  Selecione um usuário para adicionar ao projeto {project.name}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="user">Usuário</Label>
                  <Select value={newMemberUserId} onValueChange={setNewMemberUserId}>
                    <SelectTrigger id="user">
                      <SelectValue placeholder="Selecione um usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">Função</Label>
                  <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COLABORADOR">Colaborador</SelectItem>
                      <SelectItem value="PESQUISADOR">Pesquisador</SelectItem>
                      <SelectItem value="GERENTE_PROJETO">Gerente de Projeto</SelectItem>
                      <SelectItem value="VOLUNTARIO">Voluntário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAddMember} disabled={!newMemberUserId}>
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {canManageMembers && (
          <section className="rounded-lg border p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Crown className="h-4 w-4 text-muted-foreground" />
                  Liderança do projeto
                </h3>
                <p className="text-xs text-muted-foreground">Líder atual: {leaderName}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={leaderSelection} onValueChange={setLeaderSelection}>
                  <SelectTrigger className="w-full sm:w-72" aria-label="Líder do projeto">
                    <SelectValue placeholder="Selecione o líder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem líder</SelectItem>
                    {members.map((member) => (
                      <SelectItem key={member.userId} value={String(member.userId)}>
                        {member.userName || `Usuário #${member.userId}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="secondary" onClick={handleSetLeader}>Salvar líder</Button>
              </div>
            </div>
          </section>
        )}

        {members.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">Nenhum membro encontrado</h3>
            <p className="text-muted-foreground">Este projeto ainda não possui membros.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((member) => {
              const summary = describeMemberProfile(member)
              // O nome entra no nome acessível de cada controle: cinco campos se repetem por
              // membro na mesma tela, e um leitor de tela não pode ouvir "Currículo Lattes"
              // cinco vezes sem saber de quem é (mesma família da DEC-86).
              const memberName = member.userName || `usuário #${member.userId}`
              const hoursSummary = [
                `${member.totalHours || 0}h no projeto`,
                `esta semana ${member.currentWeekHours || 0}h`,
              ].join(' · ')

              return (
                <article key={member.id} className="rounded-lg border">
                  <header className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {memberName.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{memberName}</span>
                          {member.roles.map((role) => (
                            <Badge key={role} variant="outline" className="text-xs">
                              {getRoleDisplayName(role)}
                            </Badge>
                          ))}
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{member.userEmail || "Sem email"}</p>
                        {(member.totalHours || member.currentWeekHours) ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{hoursSummary}</p>
                        ) : null}
                      </div>
                    </div>
                    {canManageMembers && (
                      <div className="flex items-center gap-2">
                        <Select
                          value={memberRoleDrafts[member.userId] || member.roles?.[0] || "COLABORADOR"}
                          onValueChange={(value) =>
                            setMemberRoleDrafts((prev) => ({ ...prev, [member.userId]: value }))
                          }
                        >
                          <SelectTrigger className="w-40" aria-label={`Papel do membro de ${memberName}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="COLABORADOR">Colaborador</SelectItem>
                            <SelectItem value="PESQUISADOR">Pesquisador</SelectItem>
                            <SelectItem value="GERENTE_PROJETO">Gerente de Projeto</SelectItem>
                            <SelectItem value="VOLUNTARIO">Voluntário</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleSetMemberRole(member)}
                        >
                          Salvar papel
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Mais ações para ${memberName}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedMember(member)
                                setShowProfileDialog(true)
                              }}
                            >
                              <IdCard className="mr-2 h-4 w-4" />
                              Editar vínculo
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedMember(member)
                                setShowHoursDialog(true)
                              }}
                            >
                              <Clock className="mr-2 h-4 w-4" />
                              Adicionar horas
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setSelectedMember(member)
                                setShowRemoveDialog(true)
                              }}
                            >
                              <UserMinus className="mr-2 h-4 w-4" />
                              Remover do projeto
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </header>

                  {/*
                    V5-4b (DEC-149): os dados do vínculo são editados no dialog "Editar vínculo",
                    aberto pelo menu de ações do membro. Quem só lê vê a linha resumo, e só quando
                    existe dado (vínculo novo não ganha linha vazia).
                  */}
                  {!canManageMembers && summary ? (
                    <div className="border-t px-4 py-2.5 text-sm text-muted-foreground">
                      {summary}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}

        {/* Dialog para editar o vínculo do membro */}
        <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Editar vínculo</DialogTitle>
              <DialogDescription>
                Dados do vínculo de <strong>{profileMemberName || "membro"}</strong> no projeto {project.name}.
              </DialogDescription>
            </DialogHeader>
            {profileMember && profileDraft ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="profile-lattes">Currículo Lattes</Label>
                    <Input
                      id="profile-lattes"
                      aria-label={`Currículo Lattes de ${profileMemberName}`}
                      value={profileDraft.lattes}
                      onChange={(e) => patchProfileDraft({ lattes: e.target.value })}
                      placeholder="Ex.: 1234567890123456"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="profile-carga">Carga contratada (h/semana)</Label>
                    <Input
                      id="profile-carga"
                      aria-label={`Carga contratada (h/semana) de ${profileMemberName}`}
                      type="number"
                      min="0"
                      step="0.5"
                      value={profileDraft.cargaHoraria}
                      onChange={(e) => patchProfileDraft({ cargaHoraria: e.target.value })}
                      placeholder="Ex.: 20"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="profile-entrada">Data de entrada</Label>
                    <Input
                      id="profile-entrada"
                      aria-label={`Data de entrada de ${profileMemberName}`}
                      type="date"
                      value={profileDraft.dataEntrada}
                      onChange={(e) => patchProfileDraft({ dataEntrada: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="profile-categoria">Categoria do vínculo</Label>
                    <Select
                      value={profileDraft.categoria}
                      onValueChange={(value) => patchProfileDraft({ categoria: value })}
                    >
                      <SelectTrigger
                        id="profile-categoria"
                        aria-label={`Categoria do vínculo de ${profileMemberName}`}
                      >
                        <SelectValue placeholder="Sem categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_VALUE}>Sem categoria</SelectItem>
                        {MEMBER_CATEGORIES.map((token) => (
                          <SelectItem key={token} value={token}>
                            {MEMBER_CATEGORY_LABELS[token]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="profile-situacao">Situação do vínculo</Label>
                    <Select
                      value={profileDraft.situacao}
                      onValueChange={(value) => patchProfileDraft({ situacao: value })}
                    >
                      <SelectTrigger
                        id="profile-situacao"
                        aria-label={`Situação do vínculo de ${profileMemberName}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEMBER_SITUATIONS.map((token) => (
                          <SelectItem key={token} value={token}>
                            {MEMBER_SITUATION_LABELS[token]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  A carga contratada é a que sai no atestado; a meta semanal da pessoa é editada no
                  perfil dela.
                </p>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowProfileDialog(false)}>
                Cancelar
              </Button>
              <Button
                aria-label={`Salvar vínculo de ${profileMemberName}`}
                onClick={() => profileMember && handleSaveMemberProfile(profileMember)}
              >
                Salvar vínculo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog para remover membro */}
        <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Remover Membro</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja remover <strong>{selectedMember?.userName}</strong> do projeto?
                Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRemoveDialog(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleRemoveMember}>
                Remover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog para adicionar horas */}
        <Dialog open={showHoursDialog} onOpenChange={setShowHoursDialog}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Adicionar Horas</DialogTitle>
              <DialogDescription>
                Adicionar horas trabalhadas para <strong>{selectedMember?.userName}</strong> no projeto {project.name}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  value={hoursDate}
                  onChange={(e) => setHoursDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hours">Horas</Label>
                <Input
                  id="hours"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={manualHours}
                  onChange={(e) => setManualHours(parseFloat(e.target.value) || 0)}
                  placeholder="Ex: 8.5"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowHoursDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddManualHours} disabled={!hoursDate || manualHours <= 0}>
                Adicionar Horas
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
