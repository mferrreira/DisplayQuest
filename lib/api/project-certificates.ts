/**
 * V5-10b (DEC-75/170/171) — cliente HTTP dos atestados de frequência do projeto.
 *
 * Mesma forma de `lib/api/project-technical-reports.ts`: fetch tipado por função, erro
 * lido do corpo `{ error }` da rota. A lista é só METADADO — o CPF mora apenas no PDF,
 * que sai pela rota gateada do arquivo (DEC-171). O mês de referência é `AAAA-MM`; a
 * tela não inventa vocabulário (lição DEC-96), quem define o default é o servidor
 * (mês anterior, DEC-171).
 */

export interface ProjectCertificate {
  id: number
  userId: number
  month: string
  fileName: string
  generatedBy: number | null
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

export async function listCertificates(projectId: number): Promise<ProjectCertificate[]> {
  const payload = await request<{ certificates?: ProjectCertificate[] }>(
    `/api/projects/${projectId}/certificates`,
    { method: "GET" },
    "Erro ao buscar atestados",
  )
  return Array.isArray(payload.certificates) ? payload.certificates : []
}

/**
 * Gera (ou regenera) o atestado de um membro no mês de referência. Sem `month` o
 * servidor usa o mês anterior (DEC-171). Regenerar sobrescreve o mesmo PDF (DEC-170).
 */
export async function generateCertificate(
  projectId: number,
  input: { userId: number; month?: string },
): Promise<ProjectCertificate> {
  const payload = await request<{ certificate?: ProjectCertificate }>(
    `/api/projects/${projectId}/certificates`,
    { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) },
    "Erro ao gerar atestado",
  )
  if (!payload.certificate) {
    throw new Error("Erro ao gerar atestado")
  }
  return payload.certificate
}

/**
 * URL de download do PDF (rota autenticada, gate self OU gestão — DEC-171). O nome
 * mostrado vem do atributo `download` do link.
 */
export function certificateFileUrl(projectId: number, certificateId: number): string {
  return `/api/projects/${projectId}/certificates/${certificateId}/file`
}
