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