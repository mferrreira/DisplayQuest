import { prisma } from "@/lib/database/prisma"
import type {
  ActivityFileRecord,
  NewActivityFileInput,
  ProjectActivityFilesPort,
} from "@/backend/modules/project-management/application/ports/project-activity-files.repository"

/**
 * V5-7a (DEC-133/157) — adaptador fino de `project_activity_files`. Só metadado: o binário é
 * do bucket e quem o move é a rota pelo seam `lib/storage/blob-store.ts`. Nenhuma regra aqui.
 */
type ActivityFileRow = {
  id: number
  activityId: number
  blobKey: string
  name: string
  contentType: string
  size: number
  uploadedBy: number
  uploadedAt: Date | string
}

function toRecord(row: ActivityFileRow): ActivityFileRecord {
  return {
    id: row.id,
    activityId: row.activityId,
    blobKey: row.blobKey,
    name: row.name,
    contentType: row.contentType,
    size: row.size,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt instanceof Date ? row.uploadedAt.toISOString() : String(row.uploadedAt),
  }
}

export function createPrismaProjectActivityFilesRepository(): ProjectActivityFilesPort {
  return {
    async listByActivity(activityId: number) {
      const rows = await prisma.project_activity_files.findMany({
        where: { activityId },
        orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
      })
      return rows.map(toRecord)
    },

    async findById(id: number) {
      const row = await prisma.project_activity_files.findUnique({ where: { id } })
      return row ? toRecord(row) : null
    },

    async countByActivity(activityId: number) {
      return prisma.project_activity_files.count({ where: { activityId } })
    },

    async create(input: NewActivityFileInput) {
      const row = await prisma.project_activity_files.create({ data: input })
      return toRecord(row)
    },

    async delete(id: number) {
      await prisma.project_activity_files.delete({ where: { id } })
    },
  }
}
