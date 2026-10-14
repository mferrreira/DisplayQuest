/**
 * ProjectRepositoryPort — OND5-B2 (R1). The `projects` seam. `ProjectRecord` mirrors the
 * JSON the routes serialize today (the `Project` model's `toJSON()` key set): the adapter
 * joins members + memberCount exactly like ProjectRepository.getIncludeOptions did, so
 * `NextResponse.json({ project })` stays byte-identical.
 */
import type { ProjectMemberSummary } from "@/backend/domain"

export interface ProjectRecord {
  id?: number | null;
  name: string;
  description?: string | null;
  createdAt: string;
  createdBy: number;
  leaderId?: number | null;
  status: string;
  links?: unknown;
  memberCount?: number;
  members?: ProjectMemberSummary[];
  /** V5-2b (DEC-61/63): datas civis `YYYY-MM-DD`, texto de cadastro e saldo do projeto. */
  startDate?: string | null;
  endDate?: string | null;
  editalNumber?: string | null;
  processNumber?: string | null;
  /** V5-4a (DEC-140): nº PROPPI. */
  proppiNumber?: string | null;
  points?: number;
  /**
   * V5-2d (DEC-102): chave do objeto no bucket. A coluna guarda a CHAVE, nunca um caminho de
   * disco, e o binário é lido pelo seam (`lib/storage/blob-store.ts`) na rota de leitura.
   */
  logoKey?: string | null;
  bannerKey?: string | null;
}

/** Input for the create write (createdAt already stamped by the use case). */
export interface NewProjectInput {
  name: string;
  description: string | null;
  createdAt: string;
  createdBy: number;
  leaderId: number | null;
  status: string;
  links: unknown;
  /** V5-2b. `points` não entra: o saldo nasce do default da coluna (DEC-63/74, regra 6). */
  startDate: string | null;
  endDate: string | null;
  editalNumber: string | null;
  processNumber: string | null;
  /** V5-4a (DEC-140). */
  proppiNumber: string | null;
}

export interface ProjectRepositoryPort {
  /** createdAt DESC (frozen from ProjectRepository.findAll). V5-2a (DEC-127): é A leitura da
   *  lista para qualquer autenticado — `findByUserId`/`findByCreatorId` da regra antiga saíram. */
  findAll(): Promise<ProjectRecord[]>
  /** createdAt DESC — also the leader-conflict read (frozen). */
  findByLeaderId(leaderId: number): Promise<ProjectRecord[]>
  findById(id: number): Promise<ProjectRecord | null>
  create(input: NewProjectInput): Promise<ProjectRecord>
  /**
   * V5-5 (DEC-100, regra 9 do plano): o wizard cria projeto + metas + atividades numa escrita só.
   * O adapter faz um `create` com filhos aninhados, que o Prisma executa em transação — se uma
   * linha do cronograma falhar, o projeto não nasce. É o único caminho com transação aqui; o
   * `create` simples continua idêntico ao de antes para quem pula o passo.
   */
  createWithCronograma(
    input: NewProjectInput,
    cronograma: NewProjectCronogramaSeed,
  ): Promise<CreatedProjectWithCronograma>
  /** Full-record update; createdAt/createdBy are NOT written (frozen from the repository). */
  update(record: ProjectRecord): Promise<ProjectRecord>
  delete(id: number): Promise<void>
}

/**
 * Semente do cronograma no momento da criação: ainda não há `projectId`, porque o projeto nasce
 * junto. `order` já vem atribuído pelo use case (a ordem é decidida na regra, não pela tela).
 */
export interface NewProjectGoalSeed {
  order: number
  target: number | null
  description: string
}

export interface NewProjectActivitySeed {
  order: number
  description: string
  responsibleId: number | null
  firstMonth: string
  lastMonth: string
}

export interface NewProjectCronogramaSeed {
  goals: NewProjectGoalSeed[]
  activities: NewProjectActivitySeed[]
}

export interface CreatedProjectWithCronograma {
  project: ProjectRecord
  goalIds: number[]
  activityIds: number[]
}
