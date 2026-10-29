/**
 * V5-2c — cliente HTTP dos entregáveis e anexos do projeto.
 *
 * Mesma forma de `lib/api/project-members.ts`: fetch tipado por função, erro lido do corpo
 * `{ error }` da rota. Não passa por `lib/api/client.ts` porque os painéis de projeto já
 * vivem neste formato, e o upload é multipart.
 *
 * O `blobKey` de anexo existe na resposta da rota e NÃO entra nestes tipos: chave de bucket de
 * anexo é detalhe de servidor, e o cliente alcança o arquivo pela rota `/file`, que aplica a
 * regra de acesso do projeto. Nas imagens é o contrário: `logoKey`/`bannerKey` vêm no payload do
 * projeto e a tela precisa delas, porque são o que diz se o slot tem imagem e o que quebra o
 * cache do navegador quando a imagem muda.
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

// ---- imagem do projeto (logo/banner) — V5-2d ----

export type ProjectImageSlot = "logo" | "banner"

/**
 * Estado dos dois slots depois de uma escrita. As chaves vêm do payload do projeto (a mesma
 * coluna que `GET /api/projects/[id]` devolve) e a tela usa as duas para montar o endereço do
 * binário e quebrar o cache quando a imagem muda.
 */
export interface ProjectImageState {
  logoKey: string | null
  bannerKey: string | null
}

function readImageState(payload: unknown): ProjectImageState {
  const project = (payload as { project?: { logoKey?: string | null; bannerKey?: string | null } })?.project
  return { logoKey: project?.logoKey ?? null, bannerKey: project?.bannerKey ?? null }
}

/**
 * URL do binário da imagem, servida pela rota que aplica a regra de acesso do projeto. Funciona
 * num `<img>`: a sessão chega pelo cookie.
 *
 * `cacheKey` é a chave do objeto no bucket. A rota de leitura tem `Cache-Control: private` com
 * dia de validade, e o endereço por slot é sempre o mesmo, então sem o parâmetro o navegador
 * serviria a imagem velha depois de trocar a imagem. A chave carrega um UUID: muda junto com o
 * objeto.
 */
export function projectImageUrl(
  projectId: number,
  slot: ProjectImageSlot,
  cacheKey?: string | null,
): string {
  const path = `/api/projects/${projectId}/images/${slot}/file`
  return cacheKey ? `${path}?v=${encodeURIComponent(cacheKey)}` : path
}

export async function uploadProjectImage(
  projectId: number,
  slot: ProjectImageSlot,
  file: File,
): Promise<ProjectImageState> {
  const form = new FormData()
  form.set("file", file)
  const payload = await request<unknown>(
    `/api/projects/${projectId}/images/${slot}`,
    { method: "PUT", body: form },
    "Erro ao enviar imagem",
  )
  return readImageState(payload)
}

export async function deleteProjectImage(
  projectId: number,
  slot: ProjectImageSlot,
): Promise<ProjectImageState> {
  const payload = await request<unknown>(
    `/api/projects/${projectId}/images/${slot}`,
    { method: "DELETE" },
    "Erro ao remover imagem",
  )
  return readImageState(payload)
}

/** Tamanho legível na lista: 1,5 MB em vez de 1572864. Decimal com vírgula: a tela é pt-BR. */
export function formatAttachmentSize(bytes: number): string {
  const decimal = (value: number) => value.toFixed(1).replace(".", ",")
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${decimal(bytes / 1024)} KB`
  return `${decimal(bytes / (1024 * 1024))} MB`
}
