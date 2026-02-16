import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Trash2, UserPlus } from "lucide-react"
import { useUser } from "@/contexts/user-context"
import { useAuth } from "@/contexts/auth-context"
import { useProjectMembers } from "@/hooks/use-project-members"

interface ProjectMembersManagerProps {
  projectId: number
}

export function ProjectMembersManager({ projectId }: ProjectMembersManagerProps) {
  const { user } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [addUserId, setAddUserId] = useState("")
  const [addRoles, setAddRoles] = useState<string[]>(["VOLUNTARIO"])
  const { users, loading: usersLoading } = useUser()
  const {
    members,
    loading,
    error: membersError,
    addMember,
    removeMember,
  } = useProjectMembers(projectId)

  const canManageMembers = user && user.roles && user.roles.some((r: string) => ["GERENTE", "GERENTE_PROJETO", "COORDENADOR"].includes(r))

  if (!canManageMembers) {
    return null
  }

  const handleAddMember = async () => {
    if (!addUserId || !addRoles.length) return
    setError(null)
    try {
      await addMember(Number(addUserId), addRoles)
      setAddUserId("")
      setAddRoles(["VOLUNTARIO"])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao adicionar membro")
    }
  }

  const handleRemoveMember = async (membershipId: number) => {
    setError(null)
    try {
      await removeMember(membershipId)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover membro")
    }
  }

  // Only show users not already in the project
  const availableUsers = users.filter(
    (u) => !members.some((m) => m.userId === u.id)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Gerenciar Membros do Projeto
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(error || membersError) && <div className="text-red-600 mb-2">{error || membersError}</div>}
        <div className="mb-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Select value={addUserId} onValueChange={setAddUserId} disabled={usersLoading || loading}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um usuário para adicionar" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.name} ({Array.isArray(user.roles) ? user.roles.join(', ') : ''})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={addRoles[0]} onValueChange={v => setAddRoles([v])} disabled={loading}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VOLUNTARIO">Voluntário</SelectItem>
                  <SelectItem value="COLABORADOR">Colaborador</SelectItem>
                  <SelectItem value="GERENTE_PROJETO">Gerente</SelectItem>
                  <SelectItem value="COORDENADOR">Coordenador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddMember} disabled={!addUserId || loading}>
              Adicionar
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {members.length === 0 ? (
            <div className="text-muted-foreground">Nenhum membro neste projeto.</div>
          ) : (
            members.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-2 border rounded">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{member.userName} ({member.userEmail})</span>
                  {member.roles.map((r: string) => <Badge key={r}>{r}</Badge>)}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveMember(member.id)}
                  disabled={loading}
                  title="Remover do projeto"
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
} 
