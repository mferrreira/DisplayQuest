import type { IProject } from "@/backend/models/Project"
import type { Role } from "@/lib/auth/rbac"

export interface ListProjectsForActorQuery {
  actorId: number
  actorRoles: Role[]
}

export interface GetProjectForActorQuery {
  projectId: number
  actorId: number
  actorRoles: Role[]
}

export interface CreateProjectCommand {
  data: Omit<IProject, "id" | "createdAt" | "createdBy">
  actorId: number
  volunteerIds?: number[]
}

export interface UpdateProjectCommand {
  projectId: number
  actorId: number
  data: Partial<IProject>
}

export interface DeleteProjectCommand {
  projectId: number
  actorId: number
}

export interface GetProjectVolunteersQuery {
  projectId: number
  actorId: number
  actorRoles: Role[]
}
