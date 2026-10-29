import { prisma } from "@/lib/database/prisma"
import type {
  NewProjectAttachmentInput,
  ProjectAttachmentRecord,
  ProjectAttachmentsPort,
} from "@/backend/modules/project-management/application/ports/project-attachments.repository"

/**
 * V5-2c (DEC-101) — adaptador fino de `project_attachments`. Só metadado: o binário é do
 * bucket e quem o move é o seam `lib/storage/blob-store.ts`, chamado pela rota. Nenhuma regra
 * aqui.
 */
type AttachmentRow = {
  id: number
  projectId: number
  blobKey: string
  name: string
  contentType: string
  size: number
  uploadedBy: number
  uploadedAt: Date | string
}

function toRecord(row: AttachmentRow): ProjectAttachmentRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    blobKey: row.blobKey,
    name: row.name,
    contentType: row.contentType,
    size: row.size,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt instanceof Date ? row.uploadedAt.toISOString() : String(row.uploadedAt),
  }
}

export function createPrismaProjectAttachmentsRepository(): ProjectAttachmentsPort {
  return {
    async listByProjectId(projectId: number) {
      const rows = await prisma.project_attachments.findMany({
        where: { projectId },
        orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
      })
      return rows.map(toRecord)
    },

    async findById(id: number) {
      const row = await prisma.project_attachments.findUnique({ where: { id } })
      return row ? toRecord(row) : null
    },

    async create(input: NewProjectAttachmentInput) {
      const row = await prisma.project_attachments.create({ data: input })
      return toRecord(row)
    },

    async delete(id: number) {
      await prisma.project_attachments.delete({ where: { id } })
    },
  }
}
