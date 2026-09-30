/**
 * OND8-B2 — regras puras de LabResponsibility (SPEC §4.5).
 *
 * QUIRKS preservados como contrato:
 *  - 8L10: a responsabilidade ativa é GLOBAL (findActiveResponsibility não filtra usuário).
 *  - 8L11: end não checa acesso no gateway (a rota checa via canEndResponsibility);
 *    `notes || existing.notes` — notes falsy preserva as existentes.
 *  - Repositorio legado exige endTime ESTRITAMENTE > startTime.
 * Pause/resume: `now` sempre parâmetro (DEC-20); o adapter injeta o relógio.
 */
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain/errors"
import { isLabManagerRole } from "./lab-access-rules"

export interface ResponsibilitySnapshot {
  userId: number
  endTime?: Date | null
  pausedAt?: Date | null
  totalPausedMs?: number
  notes?: string | null
}

export function assertCanStartResponsibility(user: { roles: string[] } | null): void {
  if (!user) throw new NotFoundError("Usuário não encontrado")
  if (!isLabManagerRole(user.roles)) {
    throw new ForbiddenError("Usuário não tem permissão para iniciar responsabilidades")
  }
}

/** QUIRK-8L10: ativa global — qualquer usuário ativo no sistema bloqueia o start. */
export function assertNoActiveResponsibility(active: ResponsibilitySnapshot | null): void {
  if (active) {
    throw new ConflictError(
      "Já existe uma responsabilidade ativa. Finalize a responsabilidade atual antes de iniciar uma nova.",
    )
  }
}

/** canEndResponsibility legado: dono OU papel de lab; desconhecidos => false (sem throw). */
export function decideCanEndResponsibility(input: {
  actor: { roles: string[] } | null
  responsibility: ResponsibilitySnapshot | null
  actorUserId: number
}): boolean {
  if (!input.actor || !input.responsibility) return false
  if (input.responsibility.userId === input.actorUserId) return true
  return isLabManagerRole(input.actor.roles)
}

export function assertNotEnded(existing: { endTime?: Date | null }): void {
  if (existing.endTime) throw new ConflictError("Responsabilidade já foi finalizada")
}

/**
 * end legado: endTime = now; notes falsy preserva as existentes (QUIRK-8L11).
 * A validação endTime > startTime do repositório é aplicada aqui (agora no core).
 */
export function computeEndPatch(
  existing: { startTime: Date; endTime?: Date | null; notes?: string | null },
  notes: string | undefined,
  now: Date,
): { endTime: Date; notes?: string | null } {
  assertNotEnded(existing)
  if (now <= existing.startTime) {
    throw new ValidationError("Dados inválidos: Horário de fim deve ser posterior ao início")
  }
  return { endTime: now, notes: notes || existing.notes }
}

/** updateResponsibilityNotes legado: trim, vazio => null. */
export function computeNotesPatch(notes: string): { notes: string | null } {
  return { notes: notes.trim() || null }
}

export interface PausePatch {
  pausedAt: Date
}

/** Pause legado (modelo): no-op quando já pausada (o use case devolve a atual sem tocar). */
export function computePausePatch(existing: { pausedAt?: Date | null }, now: Date): PausePatch | null {
  if (existing.pausedAt) return null
  return { pausedAt: now }
}

export interface ResumePatch {
  pausedAt: null
  totalPausedMs: number
}

/** Resume legado: dobra o trecho pausado em totalPausedMs e limpa pausedAt. */
export function computeResumePatch(
  existing: { pausedAt?: Date | null; totalPausedMs?: number },
  now: Date,
): ResumePatch | null {
  if (!existing.pausedAt) return null
  return {
    pausedAt: null,
    totalPausedMs: (existing.totalPausedMs ?? 0) + (now.getTime() - existing.pausedAt.getTime()),
  }
}

/** Validação de criação (validateLabResponsibility do repositório, ordem verbatim). */
export function validateResponsibilityCreate(input: {
  userId?: number
  userName?: string
  startTime?: Date
  endTime?: Date | null
}): void {
  const errors: string[] = []

  if (!input.userId || input.userId <= 0) errors.push("ID do usuário é obrigatório")
  if (!input.userName || input.userName.trim().length === 0) errors.push("Nome do usuário é obrigatório")
  if (!input.startTime || isNaN(input.startTime.getTime())) errors.push("Horário de início inválido")
  if (input.endTime && input.startTime && input.endTime <= input.startTime) errors.push("Horário de fim deve ser posterior ao início")

  if (errors.length > 0) throw new ValidationError(`Dados inválidos: ${errors.join(", ")}`)
}
