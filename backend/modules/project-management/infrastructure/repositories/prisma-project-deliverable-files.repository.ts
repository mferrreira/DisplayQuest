import { prisma } from "@/lib/database/prisma"
import type {
  NewProjectDeliverableFileInput,
  ProjectDeliverableFileRecord,
  ProjectDeliverableFilesPort,
} from "@/backend/modules/project-management/application/ports/project-deliverable-files.repository"

/**
 * S02 (plan-v21) — adaptador fino de `project_deliverable_files`. Só metadado: o binário é do
 * bucket e quem o move é a rota pelo seam `lib/storage/blob-store.ts`. Nenhuma regra aqui.
 */
type DeliverableFileRow = {
  id: number
  deliverableId: number
  blobKey: string
  name: string
  contentType: string
  size: number
  uploadedBy: number
  uploadedAt: Date | string
}

function toRecord(row: DeliverableFileRow): ProjectDeliverableFileRecord {
  return {
    id: row.id,
    deliverableId: row.deliverableId,
    blobKey: row.blobKey,
    name: row.name,
    contentType: row.contentType,
    size: row.size,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt instanceof Date ? row.uploadedAt.toISOString() : String(row.uploadedAt),
  }
}

export function createPrismaProjectDeliverableFilesRepository(): ProjectDeliverableFilesPort {
  return {
    async listByDeliverable(deliverableId: number) {
      const rows = await prisma.project_deliverable_files.findMany({
        where: { deliverableId },
        orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
      })
      return rows.map(toRecord)
    },

    async findById(id: number) {
      const row = await prisma.project_deliverable_files.findUnique({ where: { id } })
      return row ? toRecord(row) : null
    },

    async countByDeliverable(deliverableId: number) {
      return prisma.project_deliverable_files.count({ where: { deliverableId } })
    },

    async create(input: NewProjectDeliverableFileInput) {
      const row = await prisma.project_deliverable_files.create({ data: input })
      return toRecord(row)
    },

    async delete(id: number) {
      const row = await prisma.project_deliverable_files.delete({ where: { id } })
      return toRecord(row)
    },
  }
}
