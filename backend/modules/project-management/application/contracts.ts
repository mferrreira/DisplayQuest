import type { ActorRef, IProject, Role } from "@/backend/domain"

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
  /** B6-3 (D4): o ator para o gate de MANAGE_PROJECTS (mensagem própria da rota, preservada). */
  actor: ActorRef
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
