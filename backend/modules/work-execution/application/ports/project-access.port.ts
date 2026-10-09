import type { DailyLog, WorkSession } from "@/backend/domain";

/**
 * ProjectAccessPort (OND3-B2, R2) — the cross-aggregate reads the work-execution gateway
 * used to do with a direct `prisma` import (ensureUserIsProjectMember, leader scope,
 * leader log reads + audit). The adapter lives in this module's infrastructure; the rules
 * themselves (membership required, scope union, audit) stay in the use cases.
 */
export interface LeaderLogsAudit {
  projectId: number;
  leaderId: number;
  requestedProjectId: number | null;
  memberUserId: number | null;
  ledProjectIds: number[];
  logCount: number;
  sessionCount: number;
}

export interface ProjectAccessPort {
  /** True when a project_members row exists for (projectId, userId). */
  isProjectMember(userId: number, projectId: number): Promise<boolean>;

  /** Projects formally led (leaderId) UNION projects where the actor holds GERENTE_PROJETO. */
  ledProjectIds(leaderId: number): Promise<number[]>;

  /** Daily logs of the given projects (createdAt desc), optionally filtered by member. */
  listProjectLogs(projectIds: number[], memberUserId?: number): Promise<DailyLog[]>;

  /** Work sessions of the given projects (startTime desc), optionally filtered by member. */
  listProjectSessions(projectIds: number[], memberUserId?: number): Promise<WorkSession[]>;

  /** Audit row for a leader read (entityType project_logs / action read_by_project_leader). */
  recordLeaderLogsAudit(audit: LeaderLogsAudit): Promise<void>;
}
