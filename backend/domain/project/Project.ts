/**
 * Project / ProjectMembership — pure domain contracts of the project aggregate (SPEC §4.5).
 *
 * `ProjectStatus` is authored HERE and `backend/models/Project.ts` re-exports it. Reason
 * measured in batch 0.4: a TypeScript enum is NOMINAL, so a domain copy of the same four
 * values would not accept the value the model enum carries, and the project gateways pass
 * that value straight into `Project.create()`. Sharing one declaration keeps the swap a pure
 * change of import path (AGENT.md §5).
 *
 * Same batch-0.4 finding as Task: the ports hand `toJSON()` to the routes, so the contract
 * declares it (mirrors `backend/models/Project.ts` verbatim; tightened in OND5-B1).
 */
import type { Role } from "../identity";

export enum ProjectStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  ARCHIVED = "archived",
  ON_HOLD = "on_hold",
}

export interface ProjectLink {
  label: string;
  url: string;
}

export interface ProjectMemberSummary {
  userId: number;
  roles: string[];
  user?: { id: number; name: string; email: string } | null;
}

export interface IProject {
  id?: number;
  name: string;
  description?: string | null;
  createdAt: string;
  createdBy: number;
  leaderId?: number | null;
  status: ProjectStatus;
  links?: ProjectLink[] | null;
  memberCount?: number;
  members?: ProjectMemberSummary[];
  /**
   * V5-2b (DEC-61/63). `startDate`/`endDate` são **data civil** `YYYY-MM-DD`, não ISO com
   * hora: `projects.createdAt` e `tasks.dueDate` já são `String` no schema e a aritmética do
   * plano é de dias civis em America/Sao_Paulo (`backend/domain/time/civil-day.ts`). Guardar
   * o instante cru reabre o erro que o plan-v3 fechou (meia-noite UTC virando o dia anterior).
   * `points` é lido pela UI e escrito só por use case de economia (DEC-63/74, regra 6).
   */
  startDate?: string | null;
  endDate?: string | null;
  editalNumber?: string | null;
  processNumber?: string | null;
  /** V5-4a (DEC-140): nº PROPPI. É dado do projeto, não da pessoa nem do vínculo. */
  proppiNumber?: string | null;
  points?: number;
}

export interface Project extends IProject {
  toJSON(): any;
}

export interface IProjectMembership {
  id?: number;
  projectId: number;
  userId: number;
  joinedAt?: Date;
  roles: Role[];
  /** Adapter join noise (prisma `include`); kept `any` exactly as the model had it. */
  user?: any;
  project?: any;
}

export interface ProjectMembership extends IProjectMembership {
  toJSON(): any;
}
