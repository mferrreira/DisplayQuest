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
