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
import type { MemberProfileFields } from "./member-data-rules";
import { civilDayOfDate } from "../time/civil-day";

// ---------------------------------------------------------------------------
// Role constants (frozen from the gateways)
// ---------------------------------------------------------------------------

/** `GLOBAL_PROJECT_MANAGERS` from prisma-project-membership.gateway.ts:16. */
export const GLOBAL_PROJECT_MANAGERS: Role[] = ["COORDENADOR", "GERENTE"];

/** Manager membership roles from project-management.gateway.ts:162. */
export const PROJECT_MANAGER_MEMBERSHIP_ROLES: string[] = ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"];

/** Statuses deleteProject accepts (project-management.gateway.ts:151). */
export const DELETABLE_PROJECT_STATUSES: string[] = ["active", "archived", "on_hold"];

// V8-1 (DEC-215): `projectPointsBalance` (DEC-74, o piso 0 do saldo do projeto) saiu daqui junto
// da coluna `projects.points`. O prêmio da atividade aprovada não tem mais destino de projeto:
// ele é distribuído às pessoas (Hamilton intacta) e passa a cair na trilha moeda na V8-5.
// A régua do prêmio em si (DEC-103: 100 × meses, ×1,5 antecipado, −10%/dia com piso 0) continua
// em `activity-rules.ts` / `cronograma-rules.ts`, intacta.

/** Volunteer-stats audience (project-management.gateway.ts:173-175). */
export function isProjectVolunteerRole(roles: string[] | undefined | null): boolean {
  return Boolean(roles?.includes("VOLUNTARIO") || roles?.includes("COLABORADOR"));
}

// ---------------------------------------------------------------------------
// ACL decisions — leitura: V5-2a (DEC-127); gestão: congelada de
// prisma-project-membership.gateway.ts:297-335 e project-management.gateway.ts:159-169
// ---------------------------------------------------------------------------

export function hasGlobalProjectPermission(actorRoles: Role[]): boolean {
  return actorRoles.some((role) => GLOBAL_PROJECT_MANAGERS.includes(role));
}

/**
 * canActorAccessProjectDecision — V5-2a (DEC-127): **leitura de projeto é do autenticado.**
 *
 * A regra antiga (MANAGE_USERS/MANAGE_PROJECTS → membership → líder/criador) morreu. Ela
 * produzia a média estranha medida na DEC-127: COLABORADOR e PESQUISADOR recebiam o projeto na
 * lista e levavam "Acesso negado ao projeto" ao abrir o detalhe, porque lista e detalhe decidiam
 * por ACLs diferentes; VOLUNTARIO e LABORATORISTA viam só o que o próprio membership dizia.
 * Hoje lista, detalhe, entregáveis, anexos, imagem, horas e membros decidem pela mesma frase:
 * **existe ator, existe leitura** — papel e membership não entram na conta.
 *
 * A função continua existindo, consumida por todos os use cases de leitura do módulo, porque é o
 * único lugar onde uma leitura restrita futura (projeto privado) voltaria a nascer. Gestão não
 * passa por aqui: `canActorManageProjectDecision`.
 */
export function canActorAccessProjectDecision(actorId: number): boolean {
  return Number.isInteger(actorId) && actorId > 0;
}

/** Membership manage gate: global OR membership with GERENTE_PROJETO. */
export function canManageProjectMembers(actorRoles: Role[], membershipRoles: string[] | null): boolean {
  if (hasGlobalProjectPermission(actorRoles)) return true;
  return Boolean(membershipRoles?.includes("GERENTE_PROJETO"));
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
  // V5-2b (DEC-61/63): datas civis `YYYY-MM-DD` e texto de cadastro. V8-1 (DEC-215): o `points`
  // do projeto saiu junto da coluna — não existe saldo de projeto para ler nem escrever.
  startDate?: string | null;
  endDate?: string | null;
  editalNumber?: string | null;
  processNumber?: string | null;
  /** V5-4a (DEC-140). */
  proppiNumber?: string | null;
}

/** Teto dos campos de texto novos, o mesmo do nome do projeto. */
export const PROJECT_TEXT_FIELD_MAX_LENGTH = 100;

/**
 * Normaliza o valor de uma data de projeto para **data civil** `YYYY-MM-DD`.
 *
 * O formulário envia `YYYY-MM-DD` (o mesmo `<input type="date">` do quadro). Um instantâneo
 * ISO entra pelo caminho do dia civil de America/Sao_Paulo, porque é assim que o resto do
 * plano lê calendário (`civil-day.ts`, DEC-31): `2026-10-14T02:00:00.000Z` ainda é 13/10 em
 * São Paulo, e gravar o texto cru faria o V5-11 mostrar o dia errado.
 *
 * Valor sem leitura válida é devolvido cru, não `null`: `null` significa "sem data", que é um
 * estado legítimo e diferente. A validação recusa o cru nomeando o campo.
 */
export function normalizeProjectDateField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "") return null;
  return civilDayOfDate(text) ?? text;
}

/** Texto de cadastro: aparado, e vazio vira `null` (como a descrição). */
export function normalizeProjectTextField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/**
 * updateProject field assignment (gateway :119-134): undefined fields untouched; name
 * String()-coerced; falsy description -> null; status/links assigned as-is; leaderId set
 * (conflict checked separately by the use case BEFORE this runs).
 *
 * V5-2b acrescenta os campos de dados, normalizados. `points` fica fora de propósito: a
 * regra 6 do plano não aceita `UPDATE` direto de UI (DEC-63/74).
 */
export function applyProjectUpdate<T extends ProjectRecordLike>(project: T, data: Record<string, unknown>): T {
  const next = { ...project };
  if (data.name !== undefined) next.name = String(data.name);
  if (data.description !== undefined) next.description = data.description ? String(data.description) : null;
  if (data.status !== undefined) next.status = data.status as string;
  if (data.links !== undefined) next.links = data.links;
  if (data.leaderId !== undefined) next.leaderId = data.leaderId as number | null;
  if (data.startDate !== undefined) next.startDate = normalizeProjectDateField(data.startDate);
  if (data.endDate !== undefined) next.endDate = normalizeProjectDateField(data.endDate);
  if (data.editalNumber !== undefined) next.editalNumber = normalizeProjectTextField(data.editalNumber);
  if (data.processNumber !== undefined) next.processNumber = normalizeProjectTextField(data.processNumber);
  if (data.proppiNumber !== undefined) next.proppiNumber = normalizeProjectTextField(data.proppiNumber);
  return next;
}

/** Verbatim copy of ProjectRepository.validateProject (repositories/ProjectRepository.ts:298-320). */
export function validateProjectInput(project: Partial<ProjectRecordLike>): string[] {
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

  // V5-2b: período e cadastro. Lidos pelo mesmo `civilDayOfDate` da premiação, para "data
  // inválida" significar a mesma coisa nos dois lados do plano.
  const startDate = project.startDate ?? null;
  const endDate = project.endDate ?? null;
  const startDay = startDate === null ? null : civilDayOfDate(startDate);
  const endDay = endDate === null ? null : civilDayOfDate(endDate);

  if (startDate !== null && startDay === null) {
    errors.push("Data de início do projeto inválida");
  }
  if (endDate !== null && endDay === null) {
    errors.push("Data de término do projeto inválida");
  }
  // Comparar `YYYY-MM-DD` na ordem do texto é comparar o calendário: só vale depois de
  // confirmar que os dois lados são dias civis reais (os inválidos já foram recusados acima).
  if (startDay !== null && endDay !== null && endDay < startDay) {
    errors.push("Data de término do projeto não pode ser anterior à data de início");
  }

  if (project.editalNumber && project.editalNumber.length > PROJECT_TEXT_FIELD_MAX_LENGTH) {
    errors.push(
      `Número de edital do projeto não pode ter mais de ${PROJECT_TEXT_FIELD_MAX_LENGTH} caracteres`,
    );
  }
  if (project.processNumber && project.processNumber.length > PROJECT_TEXT_FIELD_MAX_LENGTH) {
    errors.push(
      `Número de processo do projeto não pode ter mais de ${PROJECT_TEXT_FIELD_MAX_LENGTH} caracteres`,
    );
  }
  if (project.proppiNumber && project.proppiNumber.length > PROJECT_TEXT_FIELD_MAX_LENGTH) {
    errors.push(
      `Número PROPPI do projeto não pode ter mais de ${PROJECT_TEXT_FIELD_MAX_LENGTH} caracteres`,
    );
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

export interface MembershipRow extends MemberProfileFields {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  roles: Role[];
  joinedAt: Date;
}

export interface ProjectMemberViewOutput extends MemberProfileFields {
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
    // V5-4b (DEC-149): a lista de membros é a tela que mostra o vínculo, então os campos vão com
    // ela — pedir um por pessoa seria uma requisição por linha do quadro.
    lattes: member.lattes,
    cargaHoraria: member.cargaHoraria,
    categoria: member.categoria,
    situacao: member.situacao,
    dataEntrada: member.dataEntrada,
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
    // plan-v8 (DEC-211): a coluna `points` da pessoa passou a ser o PLACAR DO MÊS, então este
    // número (tela de voluntários, sobre a PESSOA, não sobre o projeto) agora é o placar do mês
    // corrente. A aritmética e o agregado são os mesmos; quem re-significa a exibição é a V8-7
    // (DEC-220), não esta onda.
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

