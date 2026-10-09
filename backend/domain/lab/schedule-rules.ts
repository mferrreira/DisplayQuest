/**
 * OND8-B2 — regras puras de grades (laboratory_schedules e user_schedules).
 *
 * Validação verbatim dos repositórios legados (timeRegex + ordem dos erros).
 * QUIRKS preservados como contrato:
 *  - 8L12: updateLaboratorySchedule IGNORA dayOfWeek e nunca limpa notes:
 *    `command.notes || undefined` — "" vira undefined e o adapter não escreve a coluna.
 *  - 8L13: updateUserSchedule ignora dayOfWeek (só startTime/endTime são mesclados);
 *    replaceUserSchedules bypassa a validação do repositório (createMany escreve cru) —
 *    a regra de replace é deliberadamente "sem validação".
 */
import { ValidationError } from "@/backend/domain/errors"

const TIME_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/

export interface ScheduleFields {
  dayOfWeek: number
  startTime: string
  endTime: string
}

/** Erros na ordem legada: dia -> início -> fim -> ordem (comparação NaN nunca dispara). */
export function validateScheduleFields(fields: ScheduleFields): void {
  const errors: string[] = []

  if (fields.dayOfWeek < 0 || fields.dayOfWeek > 6) errors.push("Dia da semana inválido")
  if (!fields.startTime || !TIME_REGEX.test(fields.startTime)) errors.push("Horário de início inválido")
  if (!fields.endTime || !TIME_REGEX.test(fields.endTime)) errors.push("Horário de fim inválido")

  const [sh, sm] = String(fields.startTime).split(":").map(Number)
  const [eh, em] = String(fields.endTime).split(":").map(Number)
  if (sh * 60 + sm >= eh * 60 + em) errors.push("Horário de início deve ser anterior ao fim")

  if (errors.length > 0) throw new ValidationError(`Dados inválidos: ${errors.join(", ")}`)
}

/** Slot de grade de usuário: mesma validação + ID do usuário. */
export function validateUserScheduleSlot(input: { userId?: number } & ScheduleFields): void {
  const errors: string[] = []

  if (!input.userId || input.userId <= 0) errors.push("ID do usuário é obrigatório")
  if (input.dayOfWeek < 0 || input.dayOfWeek > 6) errors.push("Dia da semana inválido")
  if (!input.startTime || !TIME_REGEX.test(input.startTime)) errors.push("Horário de início inválido")
  if (!input.endTime || !TIME_REGEX.test(input.endTime)) errors.push("Horário de fim inválido")

  const [sh, sm] = String(input.startTime).split(":").map(Number)
  const [eh, em] = String(input.endTime).split(":").map(Number)
  if (sh * 60 + sm >= eh * 60 + em) errors.push("Horário de início deve ser anterior ao fim")

  if (errors.length > 0) throw new ValidationError(`Dados inválidos: ${errors.join(", ")}`)
}

export interface LaboratoryScheduleUpdateCommand {
  dayOfWeek?: number
  startTime?: string
  endTime?: string
  notes?: string
}

export interface LaboratoryScheduleMergeResult {
  /** true quando alguma coluna entra no patch (branch do if legado). */
  changed: boolean
  startTime?: string
  endTime?: string
  /** undefined = não escreve a coluna (notes nunca é limpa — QUIRK-8L12). */
  notes?: string | null
}

export function mergeLaboratoryScheduleUpdate(
  existing: { startTime: string; endTime: string; notes?: string | null },
  command: LaboratoryScheduleUpdateCommand,
): LaboratoryScheduleMergeResult {
  if (command.startTime !== undefined || command.endTime !== undefined || command.notes !== undefined) {
    return {
      changed: true,
      startTime: command.startTime || existing.startTime,
      endTime: command.endTime || existing.endTime,
      notes: command.notes || undefined,
    }
  }
  return { changed: false }
}

export interface UserScheduleUpdateCommand {
  dayOfWeek?: number
  startTime?: string
  endTime?: string
}

export interface UserScheduleMergeResult {
  changed: boolean
  startTime?: string
  endTime?: string
}

/** QUIRK-8L13: dayOfWeek é ignorado no merge. */
export function mergeUserScheduleUpdate(
  existing: { startTime: string; endTime: string },
  command: UserScheduleUpdateCommand,
): UserScheduleMergeResult {
  if (command.startTime !== undefined || command.endTime !== undefined) {
    return {
      changed: true,
      startTime: command.startTime || existing.startTime,
      endTime: command.endTime || existing.endTime,
    }
  }
  return { changed: false }
}
