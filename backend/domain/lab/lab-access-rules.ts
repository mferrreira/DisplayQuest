/**
 * OND8-B2 — regra pura de acesso cross-user do laboratório (QUIRK-8L9).
 *
 * Tabela de prioridade legada (verbatim do gateway):
 *   GERENTE 5 > COORDENADOR 4 > LABORATORISTA 3 > GERENTE_PROJETO 2 = PESQUISADOR 2 >
 *   COLABORADOR 1 = VOLUNTARIO 1 > desconhecido 0.
 *
 * Regra: dono sempre pode; senão exige papel em {COORDENADOR, GERENTE, LABORATORISTA};
 * sendo third-party, exige prioridade ESTRITAMENTE maior que a do dono do recurso.
 * O use case compõe a mensagem por entidade ("este evento"/"eventos deste perfil",
 * "este aviso"/"avisos deste perfil") — as strings continuam verbatim.
 */
import { ForbiddenError, NotFoundError } from "@/backend/domain/errors"

export const LAB_MANAGER_ROLES = ["COORDENADOR", "GERENTE", "LABORATORISTA"] as const

const ROLE_PRIORITY: Record<string, number> = {
  GERENTE: 5,
  COORDENADOR: 4,
  LABORATORISTA: 3,
  GERENTE_PROJETO: 2,
  PESQUISADOR: 2,
  COLABORADOR: 1,
  VOLUNTARIO: 1,
}

export function getHighestRolePriority(roles: string[]): number {
  return roles.reduce((highest, role) => Math.max(highest, ROLE_PRIORITY[role] ?? 0), 0)
}

export function isLabManagerRole(roles: string[]): boolean {
  return roles.some((role) => (LAB_MANAGER_ROLES as readonly string[]).includes(role))
}

export type LabEntryAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: "no-role" }
  | { allowed: false; reason: "priority" }

export function decideLabEntryAccess(input: {
  actorUserId: number
  actorRoles: string[]
  targetUserId: number
  targetRoles: string[]
}): LabEntryAccessDecision {
  if (input.actorUserId === input.targetUserId) return { allowed: true }
  if (!isLabManagerRole(input.actorRoles)) return { allowed: false, reason: "no-role" }

  const actorPriority = getHighestRolePriority(input.actorRoles)
  const targetPriority = getHighestRolePriority(input.targetRoles)
  if (actorPriority <= targetPriority) return { allowed: false, reason: "priority" }

  return { allowed: true }
}

export type LabEntryNoun = "evento" | "aviso"

const NOUN_PLURAL: Record<LabEntryNoun, string> = { evento: "eventos", aviso: "avisos" }

/**
 * Mensagens legadas verbatim:
 *   "Usuário não tem permissão para {editar|remover} este {evento|aviso}"
 *   "Usuário não tem permissão para {editar|remover} {eventos|avisos} deste perfil"
 */
export function assertLabEntryAccess(
  decision: LabEntryAccessDecision,
  action: "editar" | "remover",
  noun: LabEntryNoun,
): void {
  if (decision.allowed) return
  if (decision.reason === "no-role") {
    throw new ForbiddenError(`Usuário não tem permissão para ${action} este ${noun}`)
  }
  throw new ForbiddenError(`Usuário não tem permissão para ${action} ${NOUN_PLURAL[noun]} deste perfil`)
}

export function assertTargetUserExists(targetUser: object | null | undefined, noun: LabEntryNoun): asserts targetUser {
  if (!targetUser) {
    throw new NotFoundError(noun === "evento" ? "Usuário do evento não encontrado" : "Usuário do aviso não encontrado")
  }
}
