/**
 * V5-2c (DEC-61/63) — port dos entregáveis do projeto (`project_deliverables`).
 *
 * Entregável é (nome, quantidade): a lista do que o projeto entrega. Não tem responsável
 * próprio — mesma escolha de `task_subtasks`, que também não tem FK para `users`.
 *
 * `createdAt` sai como string: a coluna é `DateTime`, e o record do port é o que a rota
 * devolve. A casa já faz essa conversão em `prisma-project.repository.ts` para
 * `projects.createdAt`.
 */
export interface ProjectDeliverableRecord {
  id: number
  projectId: number
  name: string
  quantity: number
  createdAt: string
}

export interface NewProjectDeliverableInput {
  projectId: number
  name: string
  quantity: number
}

export interface ProjectDeliverableUpdateFields {
  name: string
  quantity: number
}

export interface ProjectDeliverablesPort {
  listByProjectId(projectId: number): Promise<ProjectDeliverableRecord[]>
  findById(id: number): Promise<ProjectDeliverableRecord | null>
  create(input: NewProjectDeliverableInput): Promise<ProjectDeliverableRecord>
  update(id: number, fields: ProjectDeliverableUpdateFields): Promise<ProjectDeliverableRecord>
  delete(id: number): Promise<void>
}
