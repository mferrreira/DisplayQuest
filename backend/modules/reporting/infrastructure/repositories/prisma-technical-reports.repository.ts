import { prisma } from "@/lib/database/prisma"
import type {
  TechnicalReportRecord,
  TechnicalReportsRepository,
} from "@/backend/modules/reporting/application/ports/technical-reports.repository"

/**
 * V5-9 (DEC-70) — thin Prisma adapter over `technical_reports`. O par (projectId, type)
 * é único no schema; o upsert é `upsert` do Prisma sobre a chave única. Timestamps saem
 * ISO-string (shape congelado dos adapters do módulo, DEC-12).
 */
export class PrismaTechnicalReportsRepository implements TechnicalReportsRepository {
  async listByProject(projectId: number): Promise<TechnicalReportRecord[]> {
    const rows = await prisma.technical_reports.findMany({
      where: { projectId },
      orderBy: { id: "asc" },
    })
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      type: row.type,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }))
  }

  async upsert(projectId: number, type: string, content: string): Promise<TechnicalReportRecord> {
    const row = await prisma.technical_reports.upsert({
      where: { projectId_type: { projectId, type } },
      create: { projectId, type, content },
      update: { content },
    })
    return {
      id: row.id,
      projectId: row.projectId,
      type: row.type,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}
