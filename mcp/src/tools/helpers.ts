export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function asItems(value: unknown, key: string): unknown[] {
  return asArray(asRecord(value)[key])
}

const SENSITIVE_USER_FIELDS = new Set(["cpf", "password", "passwordHash"])

/** Remove do usuário o que a fase 1 não devolve: CPF e qualquer campo de senha. */
export function sanitizeUser(value: unknown): Record<string, unknown> {
  const user = asRecord(value)
  const sanitized: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(user)) {
    if (SENSITIVE_USER_FIELDS.has(key)) continue
    sanitized[key] = entry
  }
  return sanitized
}

export function sanitizeUsers(value: unknown): Array<Record<string, unknown>> {
  return asArray(value).map(sanitizeUser)
}

export function countByStatus(items: unknown[], key = "status"): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const status = asRecord(item)[key]
    if (typeof status !== "string") continue
    counts[status] = (counts[status] ?? 0) + 1
  }
  return counts
}
