/**
 * OND8-B2 — regras puras do agregado Issue (SPEC §4.5, DEC-20).
 *
 * Extraídas do DefaultLabOperationsGateway legado (golden 8.1 como contrato). Mensagens
 * legadas VERBATIM. `now` sempre parâmetro.
 *
 * QUIRKS preservados como contrato:
 *  - 8L2: create força status OPEN apesar do gateway legado pedir "in_progress" (o modelo
 *    Issue.create sobrescreve depois do spread). Aqui a decisão é explícita: OPEN.
 *  - 8L3: filtros mutuamente exclusivos (status > priority > category > reporterId >
 *    assigneeId > search); search é aplicado em memória.
 *  - 8L5: `resolution` é aceita e validada mas NUNCA persistida (sem coluna).
 *  - 8L6/8L7: assign força in_progress e unassign força open independentemente do status
 *    anterior (inclusive resolved/closed).
 */
import { ConflictError, ValidationError } from "@/backend/domain/errors"
import type { IssuePriority, IssueStatus } from "./Issue"

export interface IssueCreateInput {
  title?: unknown
  description?: unknown
  reporterId?: unknown
  priority?: unknown
  category?: unknown
  assigneeId?: unknown
}

export interface NormalizedIssueCreate {
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  category: string | null
  reporterId: number
  assigneeId: number | null
}

const VALID_PRIORITIES: IssuePriority[] = ["low", "medium", "high", "urgent"]

export function normalizeIssueCreate(command: IssueCreateInput): NormalizedIssueCreate {
  const title = String(command.title || "").trim()
  const description = String(command.description || "").trim()
  const reporterId = Number(command.reporterId)
  const assigneeId =
    command.assigneeId !== undefined && command.assigneeId !== null ? Number(command.assigneeId) : null
  const category = command.category ? String(command.category) : null
  const priority = command.priority ? String(command.priority) : "medium"

  if (!title) throw new ValidationError("Título do issue é obrigatório")
  if (!description) throw new ValidationError("Descrição do issue é obrigatória")
  if (!Number.isInteger(reporterId) || reporterId <= 0) throw new ValidationError("Reporter do issue é obrigatório")
  if (!VALID_PRIORITIES.includes(priority as IssuePriority)) throw new ValidationError("Prioridade inválida")

  return {
    title,
    description,
    // QUIRK-8L2: o gateway pedia "in_progress", o modelo força open. Contrato: open.
    status: "open",
    priority: priority as IssuePriority,
    category,
    reporterId,
    assigneeId,
  }
}

export interface IssueUpdateFields {
  title?: string
  description?: string
  priority?: string
  category?: string | null
}

/**
 * updateIssue legado: merge parcial title -> description -> priority -> category.
 * priority aceita QUALQUER string (a validação real acontece no enum do Prisma —
 * QUIRK-8L4 preservado: o adapter novo deixa o erro de escrita acontecer).
 */
export function computeIssueUpdateFields(command: Record<string, unknown>): IssueUpdateFields {
  const fields: IssueUpdateFields = {}

  if (command.title !== undefined) {
    const title = String(command.title || "").trim()
    if (!title) throw new ValidationError("Título do issue é obrigatório")
    fields.title = title
  }
  if (command.description !== undefined) {
    const description = String(command.description || "").trim()
    if (!description) throw new ValidationError("Descrição do issue é obrigatória")
    fields.description = description
  }
  if (command.priority !== undefined) fields.priority = String(command.priority)
  if (command.category !== undefined) fields.category = command.category ? String(command.category) : null

  return fields
}

export type IssueListFilter =
  | { by: "status"; value: string }
  | { by: "priority"; value: string }
  | { by: "category"; value: string }
  | { by: "reporterId"; value: number }
  | { by: "assigneeId"; value: number }
  | { by: "search"; term: string }
  | { by: "all" }

export interface IssueListQuery {
  status?: string
  priority?: string
  category?: string
  reporterId?: number
  assigneeId?: number
  search?: string
}

/** QUIRK-8L3: precedência mutuamente exclusiva; query "vazia" (tudo undefined/null/"") => all. */
export function resolveIssueListFilter(query?: IssueListQuery): IssueListFilter {
  if (query) {
    const hasValue = (v: unknown) => v !== undefined && v !== null && v !== ""
    if (hasValue(query.status)) return { by: "status", value: String(query.status) }
    if (hasValue(query.priority)) return { by: "priority", value: String(query.priority) }
    if (hasValue(query.category)) return { by: "category", value: String(query.category) }
    if (hasValue(query.reporterId)) return { by: "reporterId", value: Number(query.reporterId) }
    if (hasValue(query.assigneeId)) return { by: "assigneeId", value: Number(query.assigneeId) }
    if (hasValue(query.search)) return { by: "search", term: String(query.search).trim().toLowerCase() }
  }
  return { by: "all" }
}

export interface IssueSearchableFields {
  title: string
  description: string
  category?: string | null
}

/** Search legado: title/description/category, case-insensitive, substring (termo normalizado aqui). */
export function matchesIssueSearch(issue: IssueSearchableFields, term: string): boolean {
  const needle = term.toLowerCase()
  return (
    issue.title.toLowerCase().includes(needle) ||
    issue.description.toLowerCase().includes(needle) ||
    (issue.category ? issue.category.toLowerCase().includes(needle) : false)
  )
}

export function assertCanStartProgress(status: IssueStatus): void {
  if (status !== "open") throw new ConflictError("Apenas issues abertos podem ser iniciados")
}

export function assertNotClosed(status: IssueStatus): void {
  if (status === "closed") throw new ConflictError("Issue já está fechado")
}

export function assertCanReopen(status: IssueStatus): void {
  if (status !== "closed") throw new ConflictError("Apenas issues fechados podem ser reabertos")
}

/**
 * QUIRK-8L5: resolution é validada (blank rejeita) mas descartada — não existe coluna.
 * Retorna apenas o patch de status/resolvedAt.
 */
export function computeResolvePatch(status: IssueStatus, resolution: string | undefined, now: Date): {
  status: IssueStatus
  resolvedAt: Date
} {
  assertNotClosed(status)
  if (resolution && !resolution.trim()) throw new ValidationError("Descrição da resolução é obrigatória")
  return { status: "resolved", resolvedAt: now }
}

/** QUIRK-8L6: assign força in_progress de QUALQUER status. */
export function computeAssignPatch(assigneeId: number): { assigneeId: number; status: IssueStatus } {
  return { assigneeId, status: "in_progress" }
}

/** QUIRK-8L7: unassign força open de QUALQUER status. */
export function computeUnassignPatch(): { assigneeId: null; status: IssueStatus } {
  return { assigneeId: null, status: "open" }
}

export function computeClosePatch(): { status: IssueStatus } {
  return { status: "closed" }
}

export function computeReopenPatch(): { status: IssueStatus; resolvedAt: null } {
  return { status: "open", resolvedAt: null }
}
