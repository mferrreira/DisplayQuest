/**
 * V5-2c (DEC-101) — port dos anexos do projeto (`project_attachments`).
 *
 * O binário NÃO mora aqui: `blobKey` é a chave no bucket (DEC-101, regra 12 do plano —
 * nenhum blob novo em pasta do backend). Quem move bytes é o seam `lib/storage/blob-store.ts`,
 * chamado pela rota; este port guarda o metadado, que é o que o domínio decide.
 *
 * A separação é a mesma medida em `project-reports`: a rota escreve o arquivo pelo seam e o
 * módulo escreve o registro. Assim o use case de leitura nunca depende de bucket no ar.
 */
export interface ProjectAttachmentRecord {
  id: number
  projectId: number
  blobKey: string
  name: string
  contentType: string
  size: number
  uploadedBy: number
  uploadedAt: string
}

export interface NewProjectAttachmentInput {
  projectId: number
  blobKey: string
  name: string
  contentType: string
  size: number
  uploadedBy: number
}

export interface ProjectAttachmentsPort {
  listByProjectId(projectId: number): Promise<ProjectAttachmentRecord[]>
  findById(id: number): Promise<ProjectAttachmentRecord | null>
  create(input: NewProjectAttachmentInput): Promise<ProjectAttachmentRecord>
  delete(id: number): Promise<void>
}
