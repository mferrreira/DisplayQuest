/**
 * OND5-B2 — pure project domain (SPEC §4.5, DEC-20 pattern).
 *
 * Like `domain/task/task-rules.ts`, the project aggregate's rules are PURE FUNCTIONS over
 * the data interfaces (domain/project/Project.ts), extracted VERBATIM from the two legacy
 * gateways (`ProjectServiceGateway` 288 lines + `PrismaProjectMembershipGateway` 376 lines)
 * so the contract parity (R3, OND5-B3) can prove old-vs-new equivalence. Every quirk the
 * golden matrix pinned (OND5-B1) is a named function here:
 *
 *   - ACL: manage = global COORDENADOR/GERENTE OR membership whose roles include
 *     GERENTE_PROJETO. A membership with roles [COORDENADOR] does NOT manage (frozen).
 *   - canActorManageProject: when a membership EXISTS only its roles count — a global
 *     MANAGE_USERS holder who is a plain member cannot manage (frozen quirk).
 *   - volunteerIds: keep `typeof number && > 0`, dedup (first occurrence), skip actor/leader.
 *   - updateProject: name String()-coerced; falsy description -> null; status/links assigned
 *     as-is (the repository-level enum validation is reproduced by validateProjectInput so
 *     the "Dados inválidos: ..." message stays identical).
 *   - deleteProject: only active/archived/on_hold.
 *   - week window: Monday-based on the LOCAL clock of `now` (setDate/getHours semantics of
 *     the gateways, parameterized).
 *   - hours: SUM(duration)/3600 rounded to 2 decimals; volunteer stats totals sum the
 *     ALREADY-rounded per-volunteer hours.
 */
import { hasPermission } from "../identity";
import type { Role } from "../identity";

// ---------------------------------------------------------------------------
// Role constants (frozen from the gateways)
// ---------------------------------------------------------------------------

/** `GLOBAL_PROJECT_MANAGERS` from prisma-project-membership.gateway.ts:16. */
export const GLOBAL_PROJECT_MANAGERS: Role[] = ["COORDENADOR", "GERENTE"];

/** Manager membership roles from project-management.gateway.ts:162. */
export const PROJECT_MANAGER_MEMBERSHIP_ROLES: string[] = ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"];

/** Statuses deleteProject accepts (project-management.gateway.ts:151). */
export const DELETABLE_PROJECT_STATUSES: string[] = ["active", "archived", "on_hold"];

/** Volunteer-stats audience (project-management.gateway.ts:173-175). */
export function isProjectVolunteerRole(roles: string[] | undefined | null): boolean {
  return Boolean(roles?.includes("VOLUNTARIO") || roles?.includes("COLABORADOR"));
}

// ---------------------------------------------------------------------------
// ACL decisions (frozen from prisma-project-membership.gateway.ts:297-335)
// ---------------------------------------------------------------------------

export function hasGlobalProjectPermission(actorRoles: Role[]): boolean {
  return actorRoles.some((role) => GLOBAL_PROJECT_MANAGERS.includes(role));
}

/** listProjectMembers view gate: global OR any membership. */
export function canViewProjectMembers(actorRoles: Role[], membershipExists: boolean): boolean {
  return hasGlobalProjectPermission(actorRoles) || membershipExists;
}

/** Membership manage gate: global OR membership with GERENTE_PROJETO. */
export function canManageProjectMembers(actorRoles: Role[], membershipRoles: string[] | null): boolean {
  if (hasGlobalProjectPermission(actorRoles)) return true;
  return Boolean(membershipRoles?.includes("GERENTE_PROJETO"));
}

/** canActorAccessProject (project-management.gateway.ts:45-63). */
export function canActorAccessProjectDecision(
  actorRoles: unknown,
  actorId: number,
  membershipExists: boolean,
  project: { leaderId: number | null; createdBy: number } | null,
): boolean {
  if (hasPermission(actorRoles, "MANAGE_USERS") || hasPermission(actorRoles, "MANAGE_PROJECTS")) return true;
  if (membershipExists) return true;
  return Boolean(project && (project.leaderId === actorId || project.createdBy === actorId));
}

/**
 * canActorManageProject (project-management.gateway.ts:159-169) — QUIRK: the membership
 * branch WINS when a membership exists; the actor's global roles are only consulted for
 * membership-less actors.
 */
export function canActorManageProjectDecision(
  membershipRoles: string[] | null,
  actorUserRoles: string[] | null,
): boolean {
  if (membershipRoles !== null) {
    return membershipRoles.some((role) => PROJECT_MANAGER_MEMBERSHIP_ROLES.includes(role));
  }
  if (actorUserRoles === null) return false;
  return hasPermission(actorUserRoles, "MANAGE_USERS");
}

// ---------------------------------------------------------------------------
// Create/update payloads (frozen from project-management.gateway.ts:65-138)
// ---------------------------------------------------------------------------

/** Keep `typeof number && > 0`, dedup preserving first occurrence, skip actor/leader. */
export function normalizeVolunteerIds(volunteerIds: unknown, actorId: number, leaderId?: number | null): number[] {
  if (!Array.isArray(volunteerIds)) return [];
  const unique = Array.from(new Set(volunteerIds.filter((id) => typeof id === "number" && id > 0)));
  return unique.filter((id) => id !== actorId && id !== leaderId);
}

/** Union preserving existing order (assignProjectLeader merge + ensureProjectMembership). */
export function mergeRoles(existing: Role[], added: Role[]): Role[] {
  return Array.from(new Set([...existing, ...added])) as Role[];
}

/** Leader conflict = the target leads a project OTHER than `projectId`. */
export function hasLeaderConflict(leaderProjects: Array<{ id?: number | null }>, projectId: number): boolean {
  return leaderProjects.some((candidate) => candidate.id !== projectId);
}

export interface ProjectRecordLike {
  id?: number | null;
  name: string;
  description?: string | null;
  createdAt: string;
  createdBy: number;
  leaderId?: number | null;
  status: string;
  links?: unknown;
}

/**
 * updateProject field assignment (gateway :119-134): undefined fields untouched; name
 * String()-coerced; falsy description -> null; status/links assigned as-is; leaderId set
 * (conflict checked separately by the use case BEFORE this runs).
 */
export function applyProjectUpdate<T extends ProjectRecordLike>(project: T, data: Record<string, unknown>): T {
  const next = { ...project };
  if (data.name !== undefined) next.name = String(data.name);
  if (data.description !== undefined) next.description = data.description ? String(data.description) : null;
  if (data.status !== undefined) next.status = data.status as string;
  if (data.links !== undefined) next.links = data.links;
  if (data.leaderId !== undefined) next.leaderId = data.leaderId as number | null;
  return next;
}

/** Verbatim copy of ProjectRepository.validateProject (repositories/ProjectRepository.ts:298-320). */
export function validateProjectInput(project: {
  name?: string;
  description?: string | null;
  createdBy?: number;
  status?: string;
}): string[] {
  const errors: string[] = [];

  if (!project.name || project.name.trim().length === 0) {
    errors.push("Nome do projeto é obrigatório");
  } else if (project.name.length > 100) {
    errors.push("Nome do projeto não pode ter mais de 100 caracteres");
  }

  if (project.description && project.description.length > 500) {
    errors.push("Descrição do projeto não pode ter mais de 500 caracteres");
  }

  if (!project.createdBy || project.createdBy <= 0) {
    errors.push("ID do criador do projeto é obrigatório");
  }

  if (!["active", "completed", "archived", "on_hold"].includes(String(project.status))) {
    errors.push("Status do projeto inválido");
  }

  return errors;
}

/** The repository wrapped validation as `Dados inválidos: <joined>` — message frozen. */
export function projectValidationMessage(errors: string[]): string {
  return `Dados inválidos: ${errors.join(", ")}`;
}

export function canDeleteProjectStatus(status: string): boolean {
  return DELETABLE_PROJECT_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Hours + week window (frozen from both gateways' aggregation)
// ---------------------------------------------------------------------------

export interface WeekWindow {
  start: Date;
  end: Date;
}

/**
 * Monday-based LOCAL week: start = now - (getDay()+6)%7 days at 00:00:00.000 local;
 * end = start + 6 days at 23:59:59.999 local. `now` is a parameter (no hidden clock).
 */
export function weekWindow(now: Date): WeekWindow {
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/** SUM(seconds)/3600 rounded to 2 decimals. */
export function roundHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Views (frozen output shapes)
// ---------------------------------------------------------------------------

export interface MembershipRow {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  roles: Role[];
  joinedAt: Date;
}

export interface ProjectMemberViewOutput {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  roles: Role[];
  joinedAt: string;
  totalHours: number;
  currentWeekHours: number;
}

export function toMemberView(
  member: MembershipRow,
  totalSeconds: number,
  weekSeconds: number,
): ProjectMemberViewOutput {
  return {
    id: member.id,
    userId: member.userId,
    userName: member.userName,
    userEmail: member.userEmail,
    roles: member.roles,
    joinedAt: member.joinedAt.toISOString(),
    totalHours: roundHours(totalSeconds),
    currentWeekHours: roundHours(weekSeconds),
  };
}

export interface VolunteerMemberInput {
  userId: number;
  roles?: Role[] | null;
  joinedAt: Date;
  user?: {
    name?: string | null;
    email?: string | null;
    avatar?: string | null;
    points?: number;
    completedTasks?: number;
  } | null;
}

export interface VolunteerEntryOutput {
  id: number;
  name: string;
  email: string;
  avatar: string | null | undefined;
  role: string;
  joinedAt: Date;
  hoursWorked: number;
  currentWeekHours: number;
  tasksCompleted: number;
  pointsEarned: number;
  status: "active";
  lastActivity: string;
}

/** getProjectVolunteersStats entry (gateway :216-229) — fallbacks frozen. */
export function toVolunteerEntry(
  member: VolunteerMemberInput,
  totalSeconds: number,
  weekSeconds: number,
  now: Date,
): VolunteerEntryOutput {
  return {
    id: member.userId,
    name: member.user?.name || "Usuário",
    email: member.user?.email || "",
    avatar: member.user?.avatar,
    role: member.roles?.[0] || "VOLUNTARIO",
    joinedAt: member.joinedAt,
    hoursWorked: roundHours(totalSeconds),
    currentWeekHours: roundHours(weekSeconds),
    tasksCompleted: member.user?.completedTasks || 0,
    pointsEarned: member.user?.points || 0,
    status: "active",
    lastActivity: now.toISOString().split("T")[0],
  };
}

/** Totals over the ALREADY-rounded per-volunteer hours (gateway :232-245). */
export function summarizeVolunteerStats(volunteers: VolunteerEntryOutput[]): {
  totalVolunteers: number;
  totalHours: number;
  completedTasks: number;
  totalPoints: number;
} {
  const totalHours = volunteers.reduce((sum, volunteer) => sum + volunteer.hoursWorked, 0);
  return {
    totalVolunteers: volunteers.length,
    totalHours: Math.round(totalHours * 100) / 100,
    completedTasks: volunteers.reduce((sum, volunteer) => sum + volunteer.tasksCompleted, 0),
    totalPoints: volunteers.reduce((sum, volunteer) => sum + volunteer.pointsEarned, 0),
  };
}

/** Keep first occurrence per id (listProjectsForActor dedup, use-case :22-24). */
export function dedupeProjectsById<T extends { id?: number | null }>(projects: T[]): T[] {
  const seen = new Set<number>();
  return projects.filter((project) => {
    if (project.id == null) return true;
    if (seen.has(project.id)) return false;
    seen.add(project.id);
    return true;
  });
}
