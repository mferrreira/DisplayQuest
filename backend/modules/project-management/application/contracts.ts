import type { ActorRef, IProject, ProjectImageSlot, Role } from "@/backend/domain"

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
  /** V5-5 (DEC-100): passo opcional do wizard. Presente e vazio é o mesmo que ausente. */
  cronograma?: CreateProjectCronogramaInput
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

// ---------------------------------------------------------------------------
// V5-2d (DEC-102) — imagem do projeto (logo/banner) no bucket
// ---------------------------------------------------------------------------

/** `blobKey: null` é "tira a imagem". Quem move byte é a rota (DEC-133). */
export interface UpdateProjectImageCommand {
  projectId: number
  actorId: number
  slot: ProjectImageSlot
  blobKey: string | null
}

export interface GetProjectImageQuery {
  projectId: number
  actorId: number
  actorRoles: Role[]
  slot: ProjectImageSlot
}

// ---------------------------------------------------------------------------
// V5-5 (DEC-61/103/126/151) — cronograma: metas e atividades
// ---------------------------------------------------------------------------

/**
 * `today` é parâmetro, nunca lido dentro do use case: a grade de meses e a atividade vigente
 * são regra pura, e regra pura recebe o relógio pela mão (regra da casa, `backend/domain/`).
 */
export interface ListProjectCronogramaQuery {
  projectId: number
  today: string
}

export interface CreateProjectGoalCommand {
  projectId: number
  actorId: number
  description: unknown
  target?: unknown
}

export interface UpdateProjectGoalCommand {
  projectId: number
  goalId: number
  actorId: number
  description?: unknown
  target?: unknown
}

export interface DeleteProjectGoalCommand {
  projectId: number
  goalId: number
  actorId: number
}

export interface CreateProjectActivityCommand {
  projectId: number
  actorId: number
  description: unknown
  firstMonth: unknown
  lastMonth: unknown
  responsibleId?: unknown
}

export interface UpdateProjectActivityCommand {
  projectId: number
  activityId: number
  actorId: number
  description?: unknown
  firstMonth?: unknown
  lastMonth?: unknown
  responsibleId?: unknown
}

export interface DeleteProjectActivityCommand {
  projectId: number
  activityId: number
  actorId: number
}

/**
 * O passo opcional do wizard (DEC-100). Os valores chegam crus como nos outros comandos: quem
 * normaliza e recusa é o domínio. Ausente, ou lista vazia, é "pular o passo" — e a criação é
 * exatamente a criação simples de antes (regra 9 do plano).
 */
export interface CreateProjectCronogramaInput {
  goals?: Array<{ description: unknown; target?: unknown }>
  activities?: Array<{
    description: unknown
    firstMonth: unknown
    lastMonth: unknown
    responsibleId?: unknown
  }>
}

