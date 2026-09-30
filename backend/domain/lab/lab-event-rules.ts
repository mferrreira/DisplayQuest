/**
 * OND8-B2 — regras puras de LabEvent e LabNotice (SPEC §4.5).
 *
 * Validações verbatim do LabEventRepository/LabNoticeRepository legados:
 *  - create: erros acumulados no prefixo "Dados inválidos: " (ordem userId -> userName ->
 *    date -> note).
 *  - update: validação solta do gateway (sem prefixo) — "Data do evento inválida" /
 *    "Nota do evento é obrigatória".
 * LabNotice mora na tabela history (QUIRK-8L1) — isso é detalhe do adapter, não da regra;
 * aqui só a validação do conteúdo.
 */
import { ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain/errors"

export interface LabEventCreateInput {
  userId?: unknown
  userName?: unknown
  date?: unknown
  note?: unknown
}

/** Validação de conteúdo do create (equivalente ao validateLabEvent do repositório). */
export function validateLabEventCreate(input: LabEventCreateInput): void {
  const errors: string[] = []
  const userId = Number(input.userId)
  const userName = input.userName === undefined ? "" : String(input.userName)
  const date = input.date instanceof Date ? input.date : new Date(String(input.date ?? ""))
  const note = input.note === undefined ? "" : String(input.note)

  if (!userId || userId <= 0) errors.push("ID do usuário é obrigatório")
  if (!userName || userName.trim().length === 0) errors.push("Nome do usuário é obrigatório")
  if (!date || isNaN(date.getTime())) errors.push("Data do evento inválida")
  if (!note || note.trim().length === 0) errors.push("Nota do evento é obrigatória")

  if (errors.length > 0) throw new ValidationError(`Dados inválidos: ${errors.join(", ")}`)
}

/** Guarda de criação: usuário existe e está ATIVO (mensagens legadas verbatim). */
export function assertUserCanCreateLabEvent(user: { status: string } | null): void {
  if (!user) throw new NotFoundError("Usuário não encontrado")
  if (user.status !== "active") throw new ForbiddenError("Usuário não tem permissão para criar eventos")
}

export function assertUserCanCreateLabNotice(user: { status: string } | null): void {
  if (!user) throw new NotFoundError("Usuário não encontrado")
  if (user.status !== "active") throw new ForbiddenError("Usuário não tem permissão para criar avisos")
}

export interface LabEventUpdateFields {
  date?: Date
  note?: string
}

/** Validação solta do updateLabEvent legado (sem prefixo "Dados inválidos"). */
export function computeLabEventUpdateFields(command: { date?: Date; note?: string }): LabEventUpdateFields {
  const fields: LabEventUpdateFields = {}

  if (command.date !== undefined) {
    if (isNaN(command.date.getTime())) throw new ValidationError("Data do evento inválida")
    fields.date = command.date
  }
  if (command.note !== undefined) {
    const note = String(command.note || "").trim()
    if (!note) throw new ValidationError("Nota do evento é obrigatória")
    fields.note = note
  }

  return fields
}

/** LabNotice.create legado: note trim não-vazio. */
export function normalizeLabNoticeNote(note: unknown): string {
  const trimmed = String(note ?? "").trim()
  if (!trimmed) throw new ValidationError("Aviso é obrigatório")
  return trimmed
}

/**
 * Janela do DIA LOCAL (legado LabEventRepository.findByDate: setHours 0..23:59:59.999).
 * TZ-dependente por contrato (mesma fórmula do legado — golden 8.1).
 */
export function computeLocalDayWindow(date: Date): { start: Date; end: Date } {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}
