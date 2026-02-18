import type { UserRole } from "@prisma/client"
import type { Role } from "@/lib/auth/rbac"

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

export interface ProjectMemberView {
  id: number
  userId: number
  userName: string | null
  userEmail: string | null
  roles: UserRole[]
  joinedAt: string
  totalHours: number
  currentWeekHours: number
}

export interface CreatedProjectMemberView {
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
