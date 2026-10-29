/**
 * V5-5 (DEC-126/151) — cliente HTTP do cronograma do projeto.
 *
 * Mesma forma de `lib/api/project-files.ts`: fetch tipado por função, erro lido do corpo
 * `{ error }` da rota.
 *
 * O que chega da leitura já vem derivado (meses da linha, `periodoInicio`, `periodoFim`,
 * `recompensa`, `current`) — é a regra do domínio aplicada no use case, não um cálculo do
 * cliente. Reescrever essa aritmética aqui seria a regra em duas cópias com uma delas mentindo
 * (DEC-90); a tela usa o número que veio da resposta e, para o clique na grade, importa a MESMA
 * função do domínio (`toggleActivityMonthRange`) que a rota usa.
 */

export interface ProjectGoal {
  id: number
  projectId: number
  order: number
  target: number | null
  description: string
  createdAt: string
}

export interface ProjectActivity {
  id: number
  projectId: number
  order: number
  description: string
  responsibleId: number | null
  firstMonth: string
  lastMonth: string
  status: string
  requestedBy: number | null
  requestedAt: string | null
  approvedBy: number | null
  approvedAt: string | null
  /** Derivados na leitura (DEC-126a/DEC-103): não são colunas do banco. */
  months: string[]
  periodoInicio: string
  periodoFim: string
  reward: number
  current: boolean
}

export interface ProjectCronogramaView {
  projectId: number
  /** Data civil de hoje, a do servidor (o cliente não calcula fuso). */
  today: string
  months: string[]
  goals: ProjectGoal[]
  activities: ProjectActivity[]
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

export async function getCronograma(projectId: number): Promise<ProjectCronogramaView> {
  const payload = await request<{ cronograma?: ProjectCronogramaView }>(
    `/api/projects/${projectId}/cronograma`,
    { method: "GET" },
    "Erro ao buscar cronograma",
  )
  const view = payload.cronograma
  return {
    projectId,
    today: typeof view?.today === "string" ? view.today : "",
    months: Array.isArray(view?.months) ? view.months : [],
    goals: Array.isArray(view?.goals) ? view.goals : [],
    activities: Array.isArray(view?.activities) ? view.activities : [],
  }
}

// ---- metas ----

export async function createProjectGoal(
  projectId: number,
  input: { description: string; target?: number | null },
): Promise<ProjectGoal> {
  const payload = await request<{ goal: ProjectGoal }>(
    `/api/projects/${projectId}/goals`,
    { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) },
    "Erro ao criar meta",
  )
  return payload.goal
}

export async function updateProjectGoal(
  projectId: number,
  goalId: number,
  input: { description?: string; target?: number | null },
): Promise<ProjectGoal> {
  const payload = await request<{ goal: ProjectGoal }>(
    `/api/projects/${projectId}/goals/${goalId}`,
    { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(input) },
    "Erro ao atualizar meta",
  )
  return payload.goal
}

export async function deleteProjectGoal(projectId: number, goalId: number): Promise<void> {
  await request(
    `/api/projects/${projectId}/goals/${goalId}`,
    { method: "DELETE" },
    "Erro ao apagar meta",
  )
}

// ---- atividades ----

export async function createProjectActivity(
  projectId: number,
  input: {
    description: string
    firstMonth: string
    lastMonth: string
    responsibleId?: number | null
  },
): Promise<ProjectActivity> {
  const payload = await request<{ activity: ProjectActivity }>(
    `/api/projects/${projectId}/activities`,
    { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) },
    "Erro ao criar atividade",
  )
  return payload.activity
}

export async function updateProjectActivity(
  projectId: number,
  activityId: number,
  input: {
    description?: string
    firstMonth?: string
    lastMonth?: string
    responsibleId?: number | null
  },
): Promise<ProjectActivity> {
  const payload = await request<{ activity: ProjectActivity }>(
    `/api/projects/${projectId}/activities/${activityId}`,
    { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(input) },
    "Erro ao atualizar atividade",
  )
  return payload.activity
}

export async function deleteProjectActivity(projectId: number, activityId: number): Promise<void> {
  await request(
    `/api/projects/${projectId}/activities/${activityId}`,
    { method: "DELETE" },
    "Erro ao apagar atividade",
  )
}

// ---- provas da atividade + solicitar conclusão (V5-7a, DEC-76/157/162) ----

export interface ActivityProof {
  id: number
  activityId: number
  name: string
  contentType: string
  size: number
  uploadedBy: number
  uploadedAt: string
}

export async function listActivityProofs(
  projectId: number,
  activityId: number,
): Promise<ActivityProof[]> {
  const payload = await request<{ files?: ActivityProof[] }>(
    `/api/projects/${projectId}/activities/${activityId}/files`,
    { method: "GET" },
    "Erro ao buscar provas",
  )
  return Array.isArray(payload.files) ? payload.files : []
}

/**
 * Upload do arquivo: `FormData` cru, sem `Content-Type` montado à mão — o boundary é do fetch.
 * O binário não passa por aqui: a rota escreve no bucket pelo seam (DEC-133).
 */
export async function uploadActivityProof(
  projectId: number,
  activityId: number,
  file: File,
): Promise<ActivityProof> {
  const form = new FormData()
  form.set("file", file)
  const payload = await request<{ file: ActivityProof }>(
    `/api/projects/${projectId}/activities/${activityId}/files`,
    { method: "POST", body: form },
    "Erro ao enviar prova",
  )
  return payload.file
}

export async function deleteActivityProof(
  projectId: number,
  activityId: number,
  fileId: number,
): Promise<void> {
  await request(
    `/api/projects/${projectId}/activities/${activityId}/files/${fileId}`,
    { method: "DELETE" },
    "Erro ao apagar prova",
  )
}

export async function requestActivityCompletion(
  projectId: number,
  activityId: number,
): Promise<ProjectActivity> {
  const payload = await request<{ activity: ProjectActivity }>(
    `/api/projects/${projectId}/activities/${activityId}/request-completion`,
    { method: "POST" },
    "Erro ao solicitar conclusão",
  )
  return payload.activity
}

/**
 * V5-7b (DEC-76/77/103/104): aprovar a conclusão. A resposta carrega a economia — `award`,
 * `shares` (creditado por membro) e `projectsPoints` (saldo novo) — a tela não recalcula (R7).
 */
export interface ActivityApprovalResult {
  activity: ProjectActivity
  award: number
  shares: Array<{ userId: number; points: number }>
  projectsPoints: number
}

export async function approveActivityCompletion(
  projectId: number,
  activityId: number,
): Promise<ActivityApprovalResult> {
  return await request<ActivityApprovalResult>(
    `/api/projects/${projectId}/activities/${activityId}/approve-completion`,
    { method: "POST" },
    "Erro ao aprovar conclusão",
  )
}