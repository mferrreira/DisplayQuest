/**
 * V5-5 (DEC-61/103/126/151) — port do cronograma do projeto (`project_goals` + `project_activities`).
 *
 * O record é o que a rota devolve. `createdAt`/`updatedAt` saem como string porque a coluna é
 * `DateTime` e a casa já converte isso em `prisma-project-deliverables.repository.ts`.
 *
 * O que NÃO está aqui: `periodoInicio`, `periodoFim` e `recompensa`. Eles são derivados na regra
 * (`cronograma-rules.ts`) a partir de `firstMonth`/`lastMonth`, e o use case os acrescenta na
 * leitura. Guardar o derivado seria a regra em duas cópias com um prazo para divergir — é a lição
 * da DEC-90.
 */
export interface ProjectGoalRecord {
  id: number
  projectId: number
  order: number
  target: number | null
  description: string
  createdAt: string
}

export interface ProjectActivityRecord {
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
  overdueNotifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface NewProjectGoalInput {
  projectId: number
  order: number
  target: number | null
  description: string
}

export interface NewProjectActivityInput {
  projectId: number
  order: number
  description: string
  responsibleId: number | null
  firstMonth: string
  lastMonth: string
}

/**
 * Corpo parcial: chave ausente não apaga (mesma regra medida do vínculo no V5-4b). Para a
 * atividade, `status` não entra — quem muda status é o fluxo de solicitar/aprovar do V5-7.
 */
export interface ProjectGoalUpdateFields {
  target?: number | null
  description?: string
}

export interface ProjectActivityUpdateFields {
  description?: string
  responsibleId?: number | null
  firstMonth?: string
  lastMonth?: string
}

/**
 * Escrita da fase de solicitar (V5-7a, DEC-76): status + quem pediu + quando. O corpo parcial
 * do PATCH do formulário não alcança estas colunas de propósito (DEC-156) — só este método,
 * chamado pelo use case que passou por gate, trava e prova.
 */
export interface ActivityRequestFields {
  status: string
  requestedBy: number
  requestedAt: Date
}

/** Escrita da fase de aprovar (V5-7b, DEC-76): status + quem aprovou + quando. */
export interface ActivityApprovalFields {
  status: string
  approvedBy: number
  approvedAt: Date
}

export interface ProjectCronogramaPort {
  listGoals(projectId: number): Promise<ProjectGoalRecord[]>
  findGoalById(id: number): Promise<ProjectGoalRecord | null>
  createGoal(input: NewProjectGoalInput): Promise<ProjectGoalRecord>
  updateGoal(id: number, fields: ProjectGoalUpdateFields): Promise<ProjectGoalRecord>
  deleteGoal(id: number): Promise<void>

  listActivities(projectId: number): Promise<ProjectActivityRecord[]>
  findActivityById(id: number): Promise<ProjectActivityRecord | null>
  createActivity(input: NewProjectActivityInput): Promise<ProjectActivityRecord>
  updateActivity(id: number, fields: ProjectActivityUpdateFields): Promise<ProjectActivityRecord>
  requestActivity(id: number, fields: ActivityRequestFields): Promise<ProjectActivityRecord>
  approveActivity(id: number, fields: ActivityApprovalFields): Promise<ProjectActivityRecord>
  deleteActivity(id: number): Promise<void>
}
