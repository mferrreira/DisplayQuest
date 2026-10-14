/**
 * V5-9 (DEC-70/139/167) — cliente HTTP dos relatórios técnicos do projeto.
 *
 * Mesma forma de `lib/api/project-cronograma.ts`: fetch tipado por função, erro lido do
 * corpo `{ error }` da rota. O vocabulário de tipo é o do servidor (lista fechada de
 * três, DEC-70); o cliente não inventa tipo próprio (lição DEC-96).
 */

export interface TechnicalReport {
  id: number
  projectId: number
  type: string
  content: string
  createdAt: string
  updatedAt: string
}

async function readJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

function buildErrorMessage(payload: unknown, fallback: string) {
  const error = (payload as { error?: unknown })?.error
  return typeof error === "string" && error.length > 0 ? error : fallback
}

async function request<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(path, init)
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, fallback))
  }
  return payload as T
}

const jsonHeaders = { "Content-Type": "application/json" }

export async function listTechnicalReports(projectId: number): Promise<TechnicalReport[]> {
  const payload = await request<{ reports?: TechnicalReport[] }>(
    `/api/projects/${projectId}/technical-reports`,
    { method: "GET" },
    "Erro ao buscar relatórios técnicos",
  )
  return Array.isArray(payload.reports) ? payload.reports : []
}

export async function saveTechnicalReport(
  projectId: number,
  input: { type: string; content: string },
): Promise<TechnicalReport> {
  const payload = await request<{ report?: TechnicalReport }>(
    `/api/projects/${projectId}/technical-reports`,
    { method: "PUT", headers: jsonHeaders, body: JSON.stringify(input) },
    "Erro ao salvar relatório técnico",
  )
  if (!payload.report) {
    throw new Error("Erro ao salvar relatório técnico")
  }
  return payload.report
}
