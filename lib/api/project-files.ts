/**
 * V5-2c — cliente HTTP dos entregáveis e anexos do projeto.
 *
 * Mesma forma de `lib/api/project-members.ts`: fetch tipado por função, erro lido do corpo
 * `{ error }` da rota. Não passa por `lib/api/client.ts` porque os painéis de projeto já
 * vivem neste formato, e o upload é multipart.
 *
 * O `blobKey` existe na resposta da rota e NÃO entra nestes tipos: chave de bucket é detalhe
 * de servidor. O cliente alcança o arquivo pela rota `/file`, que aplica a regra de acesso do
 * projeto.
 */

export interface ProjectDeliverable {
  id: number
  projectId: number
  name: string
  quantity: number
  createdAt: string
}

export interface ProjectAttachment {
  id: number
  projectId: number
  name: string
  contentType: string
  size: number
  uploadedBy: number
  uploadedAt: string
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

// ---- entregáveis ----

export async function listProjectDeliverables(projectId: number): Promise<ProjectDeliverable[]> {
  const payload = await request<{ deliverables?: ProjectDeliverable[] }>(
    `/api/projects/${projectId}/deliverables`,
    { method: "GET" },
    "Erro ao buscar entregáveis",
  )
  return Array.isArray(payload.deliverables) ? payload.deliverables : []
}

export async function createProjectDeliverable(
  projectId: number,
  input: { name: string; quantity?: number },
): Promise<ProjectDeliverable> {
  const payload = await request<{ deliverable: ProjectDeliverable }>(
    `/api/projects/${projectId}/deliverables`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    "Erro ao criar entregável",
  )
  return payload.deliverable
}

export async function updateProjectDeliverable(
  projectId: number,
  deliverableId: number,
  input: { name?: string; quantity?: number },
): Promise<ProjectDeliverable> {
  const payload = await request<{ deliverable: ProjectDeliverable }>(
    `/api/projects/${projectId}/deliverables/${deliverableId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    "Erro ao atualizar entregável",
  )
  return payload.deliverable
}

export async function deleteProjectDeliverable(projectId: number, deliverableId: number): Promise<void> {
  await request<unknown>(
    `/api/projects/${projectId}/deliverables/${deliverableId}`,
    { method: "DELETE" },
    "Erro ao excluir entregável",
  )
}

// ---- anexos ----

export async function listProjectAttachments(projectId: number): Promise<ProjectAttachment[]> {
  const payload = await request<{ attachments?: ProjectAttachment[] }>(
    `/api/projects/${projectId}/attachments`,
    { method: "GET" },
    "Erro ao buscar anexos",
  )
  return Array.isArray(payload.attachments) ? payload.attachments : []
}

export async function uploadProjectAttachment(projectId: number, file: File): Promise<ProjectAttachment> {
  const form = new FormData()
  form.set("file", file)
  const payload = await request<{ attachment: ProjectAttachment }>(
    `/api/projects/${projectId}/attachments`,
    { method: "POST", body: form },
    "Erro ao enviar anexo",
  )
  return payload.attachment
}

export async function deleteProjectAttachment(projectId: number, attachmentId: number): Promise<void> {
  await request<unknown>(
    `/api/projects/${projectId}/attachments/${attachmentId}`,
    { method: "DELETE" },
    "Erro ao excluir anexo",
  )
}

/** URL do binário, servida pela rota que aplica a regra de acesso do projeto. */
export function projectAttachmentFileUrl(projectId: number, attachmentId: number): string {
  return `/api/projects/${projectId}/attachments/${attachmentId}/file`
}

/** Tamanho legível na lista: 1,5 MB em vez de 1572864. Decimal com vírgula: a tela é pt-BR. */
export function formatAttachmentSize(bytes: number): string {
  const decimal = (value: number) => value.toFixed(1).replace(".", ",")
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${decimal(bytes / 1024)} KB`
  return `${decimal(bytes / (1024 * 1024))} MB`
}
