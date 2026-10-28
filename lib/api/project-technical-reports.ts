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

/** Arquivo gerado (V5-9b, DEC-139): um DOCX por membro ATIVO, chave derivada no bucket. */
export interface GeneratedTechnicalReportFile {
  userId: number
  memberName: string
  key: string
  fileName: string
  warnings: string[]
}

export async function generateTechnicalReports(
  projectId: number,
  type: string,
): Promise<GeneratedTechnicalReportFile[]> {
  const payload = await request<{ files?: GeneratedTechnicalReportFile[] }>(
    `/api/projects/${projectId}/technical-reports/${type}/generate`,
    { method: "POST" },
    "Erro ao gerar relatórios técnicos",
  )
  return Array.isArray(payload.files) ? payload.files : []
}

/**
 * URL de download do DOCX (rota autenticada, DEC-135/167). O nome mostrado vem do
 * atributo `download` do link; o servidor entrega com nome genérico.
 */
export function technicalReportFileUrl(
  projectId: number,
  reportId: number,
  userId: number,
): string {
  return `/api/projects/${projectId}/technical-reports/${reportId}/file?userId=${userId}`
}

/**
 * Rascunho de IA (V5-9c, DEC-139/152): o servidor monta o prompt com as três fontes e
 * devolve o texto para o editor. Nada é salvo — salvar é decisão humana (PUT).
 */
export async function draftTechnicalReport(projectId: number, type: string): Promise<string> {
  const payload = await request<{ draft?: string }>(
    `/api/projects/${projectId}/technical-reports/${type}/draft`,
    { method: "POST" },
    "Erro ao gerar rascunho",
  )
  if (typeof payload.draft !== "string") {
    throw new Error("Erro ao gerar rascunho")
  }
  return payload.draft
}
