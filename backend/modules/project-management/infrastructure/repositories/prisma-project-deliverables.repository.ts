import { prisma } from "@/lib/database/prisma"
import type {
  NewProjectDeliverableInput,
  ProjectDeliverableRecord,
  ProjectDeliverableUpdateFields,
  ProjectDeliverablesPort,
} from "@/backend/modules/project-management/application/ports/project-deliverables.repository"

/**
 * V5-2c (DEC-61/63) — adaptador fino de `project_deliverables`. Nenhuma regra aqui: nome,
 * quantidade e teto são decididos em `backend/domain/project/project-files-rules.ts` pelos
 * use cases. `createdAt` sai ISO porque a coluna é `DateTime`.
 */
type DeliverableRow = {
  id: number
  projectId: number
  name: string
  quantity: number
  createdAt: Date | string
}

function toRecord(row: DeliverableRow): ProjectDeliverableRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    quantity: row.quantity,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  }
}

export function createPrismaProjectDeliverablesRepository(): ProjectDeliverablesPort {
  return {
    async listByProjectId(projectId: number) {
      const rows = await prisma.project_deliverables.findMany({
        where: { projectId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
      return rows.map(toRecord)
    },

    async findById(id: number) {
      const row = await prisma.project_deliverables.findUnique({ where: { id } })
      return row ? toRecord(row) : null
    },

    async create(input: NewProjectDeliverableInput) {
      const row = await prisma.project_deliverables.create({ data: input })
      return toRecord(row)
    },

    async update(id: number, fields: ProjectDeliverableUpdateFields) {
      const row = await prisma.project_deliverables.update({ where: { id }, data: fields })
      return toRecord(row)
    },

    async delete(id: number) {
      await prisma.project_deliverables.delete({ where: { id } })
    },
  }
}
