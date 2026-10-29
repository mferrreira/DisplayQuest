import type { MemberProfileFields, Role, UserRole } from "@/backend/domain"

export interface ListProjectMembersQuery {
  projectId: number
  actorUserId: number
  actorRoles: Role[]
}

export interface AddProjectMemberCommand {
  projectId: number
  actorUserId: number
  actorRoles: Role[]
  targetUserId: number
  roles: UserRole[]
}

export interface RemoveProjectMemberCommand {
  projectId: number
  actorUserId: number
  actorRoles: Role[]
  membershipId: number
}

export interface UpsertProjectMemberRolesCommand {
  projectId: number
  actorUserId: number
  actorRoles: Role[]
  targetUserId: number
  roles: UserRole[]
}

export interface AssignProjectLeaderCommand {
  projectId: number
  actorUserId: number
  actorRoles: Role[]
  targetUserId: number | null
}

/**
 * V5-4b (DEC-149): editar os dados do vínculo. A chave é o `membershipId` — o vínculo, não a
 * pessoa — porque um mesmo usuário pode ter vínculos em projetos diferentes e o corpo é parcial:
 * chave ausente não apaga dado.
 */
export interface UpdateProjectMemberProfileCommand {
  projectId: number
  actorUserId: number
  actorRoles: Role[]
  membershipId: number
  data: Record<string, unknown>
}

export interface ProjectMemberView extends MemberProfileFields {
  id: number
  userId: number
  userName: string | null
  userEmail: string | null
  roles: UserRole[]
  joinedAt: string
  totalHours: number
  currentWeekHours: number
}

export interface CreatedProjectMemberView extends MemberProfileFields {
  id: number
  userId: number
  userName: string | null
  userEmail: string | null
  roles: UserRole[]
  joinedAt: string
}

export interface ProjectLeaderView {
  projectId: number
  leaderId: number | null
}
