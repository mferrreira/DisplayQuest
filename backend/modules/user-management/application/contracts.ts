import type { UserRole } from "@prisma/client"

export interface ListUsersForActorQuery {
  actorRoles: string[]
}

export interface DeductUserHoursCommand {
  userId: number
  hours: number
  reason: string
  projectId?: number
  deductedBy: number
  deductedByRoles: string[]
}

export interface UpdateUserPointsCommand {
  userId: number
  action: "add" | "remove" | "set"
  points: number
}

export interface UpdateUserRolesCommand {
  userId: number
  action: "add" | "remove" | "set"
  role?: UserRole
  roles?: UserRole[]
}

export interface UpdateUserStatusCommand {
  userId: number
  action: "approve" | "reject" | "suspend" | "activate"
}

export interface ListLeaderboardQuery {
  type: "points" | "tasks"
  limit?: number
}

export interface ListUserProfilesQuery {
  type: "public" | "members"
}
