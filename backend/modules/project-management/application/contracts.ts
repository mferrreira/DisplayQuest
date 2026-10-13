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

// ---------------------------------------------------------------------------
// V5-2c (DEC-61/63/101) — entregáveis e anexos do projeto
// ---------------------------------------------------------------------------

export interface ListProjectDeliverablesQuery {
  projectId: number
  actorId: number
  actorRoles: Role[]
}

/** `name`/`quantity` chegam crus do corpo: quem normaliza e recusa é o domínio. */
export interface CreateProjectDeliverableCommand {
  projectId: number
  actorId: number
  name: unknown
  quantity?: unknown
}

export interface UpdateProjectDeliverableCommand {
  projectId: number
  deliverableId: number
  actorId: number
  name?: unknown
  quantity?: unknown
}

export interface DeleteProjectDeliverableCommand {
  projectId: number
  deliverableId: number
  actorId: number
}

export interface ListProjectAttachmentsQuery {
  projectId: number
  actorId: number
  actorRoles: Role[]
}

/**
 * `blobKey` vem da rota: foi ela que escreveu o objeto no bucket pelo seam
 * (`lib/storage/blob-store.ts`). O use case decide a autorização e o metadado, nunca o byte.
 */
export interface AddProjectAttachmentCommand {
  projectId: number
  actorId: number
  blobKey: string
  name: unknown
  contentType: string
  size: number
}

export interface RemoveProjectAttachmentCommand {
  projectId: number
  attachmentId: number
  actorId: number
}

export interface GetProjectAttachmentQuery {
  projectId: number
  attachmentId: number
  actorId: number
  actorRoles: Role[]
}
