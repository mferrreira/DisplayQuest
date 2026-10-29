/**
 * V5-7a (DEC-76/157/162) — port das PROVAS de atividade (`project_activity_files`).
 *
 * Espelha `project-attachments.repository.ts` (DEC-133): o record é metadado; o binário é do
 * bucket e quem o move é a rota pelo seam `lib/storage/blob-store.ts`. Nenhuma regra aqui.
 *
 * O que NÃO está aqui: contagem de tarefa pendente. Tarefa é tabela do módulo de tasks; o
 * fluxo de solicitar conclusão lê isso pela `ActivityTasksPort`, que é o desenho medido do
 * `ProjectHoursPort` (o módulo lê a tabela alheia por porta própria, RG-04).
 */
export interface ActivityFileRecord {
  id: number
  activityId: number
  blobKey: string
  name: string
  contentType: string
  size: number
  uploadedBy: number
  uploadedAt: string
}

export interface NewActivityFileInput {
  activityId: number
  blobKey: string
  name: string
  contentType: string
  size: number
  uploadedBy: number
}

export interface ProjectActivityFilesPort {
  listByActivity(activityId: number): Promise<ActivityFileRecord[]>
  findById(id: number): Promise<ActivityFileRecord | null>
  countByActivity(activityId: number): Promise<number>
  create(input: NewActivityFileInput): Promise<ActivityFileRecord>
  delete(id: number): Promise<void>
}
