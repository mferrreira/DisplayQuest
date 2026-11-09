/**
 * S02 (plan-v21) — port dos ARQUIVOS de entregável (`project_deliverable_files`).
 *
 * Espelha `project-activity-files.repository.ts` (DEC-133): o record é metadado; o binário é do
 * bucket e quem o move é a rota pelo seam `lib/storage/blob-store.ts`. Nenhuma regra aqui.
 */
export interface ProjectDeliverableFileRecord {
  id: number
  deliverableId: number
  blobKey: string
  name: string
  contentType: string
  size: number
  uploadedBy: number
  uploadedAt: string
}

export interface NewProjectDeliverableFileInput {
  deliverableId: number
  blobKey: string
  name: string
  contentType: string
  size: number
  uploadedBy: number
}

export interface ProjectDeliverableFilesPort {
  listByDeliverable(deliverableId: number): Promise<ProjectDeliverableFileRecord[]>
  findById(id: number): Promise<ProjectDeliverableFileRecord | null>
  countByDeliverable(deliverableId: number): Promise<number>
  create(input: NewProjectDeliverableFileInput): Promise<ProjectDeliverableFileRecord>
  delete(id: number): Promise<void>
}
