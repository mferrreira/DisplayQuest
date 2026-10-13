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
  points?: number;
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
}

export interface ProjectRepositoryPort {
  /** createdAt DESC (frozen from ProjectRepository.findAll). */
  findAll(): Promise<ProjectRecord[]>
  findByUserId(userId: number): Promise<ProjectRecord[]>
  findByCreatorId(creatorId: number): Promise<ProjectRecord[]>
  /** createdAt DESC — also the leader-conflict read (frozen). */
  findByLeaderId(leaderId: number): Promise<ProjectRecord[]>
  findById(id: number): Promise<ProjectRecord | null>
  create(input: NewProjectInput): Promise<ProjectRecord>
  /** Full-record update; createdAt/createdBy are NOT written (frozen from the repository). */
  update(record: ProjectRecord): Promise<ProjectRecord>
  delete(id: number): Promise<void>
}
