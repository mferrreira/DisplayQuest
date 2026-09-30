import { prisma } from "@/lib/database/prisma"
import type {
  ProjectReportsRepository,
  ProjectReportRow,
  ProjectReportWithRelations,
} from "@/backend/modules/reporting/application/ports/project-reports.repository"

/** OND7-B3 — thin Prisma adapter over `project_reports`. `findIds` receives the where
 * fragment AS BUILT by the use case (QUIRK-7M collision preserved there, not here). */
export class PrismaProjectReportsRepository implements ProjectReportsRepository {
  async findById(id: number): Promise<ProjectReportRow | null> {
    return await prisma.project_reports.findUnique({ where: { id } })
  }

  async findProjectId(id: number): Promise<{ projectId: number } | null> {
    return await prisma.project_reports.findUnique({ where: { id }, select: { projectId: true } })
  }

  async findWithRelations(id: number): Promise<ProjectReportWithRelations | null> {
    const report = await prisma.project_reports.findUnique({
      where: { id },
      include: {
        project: { select: { name: true } },
        author: { select: { name: true } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    })
    if (!report) return null
    return {
      ...report,
      project: report.project ?? null,
      author: report.author ?? null,
      attachments: report.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        storedPath: a.storedPath,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        createdAt: a.createdAt,
      })),
    }
  }

  async findIdByCompound(compound: {
    projectId: number
    periodType: string
    periodStart: Date
    authorId: number
  }): Promise<{ id: number } | null> {
    return await prisma.project_reports.findUnique({
      where: {
        projectId_periodType_periodStart_authorId: {
          projectId: compound.projectId,
          periodType: compound.periodType,
          periodStart: compound.periodStart,
          authorId: compound.authorId,
        },
      },
      select: { id: true },
    })
  }

  async findIds(query: {
    projectIds?: number[]
    periodType?: string
    authorId?: number
    periodStart?: { gte?: Date; lte?: Date }
  }): Promise<Array<{ id: number }>> {
    return await prisma.project_reports.findMany({
      where: {
        ...(query.projectIds ? { projectId: { in: query.projectIds } } : {}),
        ...(query.periodType ? { periodType: query.periodType } : {}),
        ...(query.authorId ? { authorId: query.authorId } : {}),
        ...(query.periodStart ? { periodStart: query.periodStart } : {}),
      },
      orderBy: { periodStart: "desc" },
      select: { id: true },
    })
  }

  async create(data: {
    projectId: number
    authorId: number
    periodType: string
    periodStart: Date
    periodEnd: Date
    title: string | null
    content: string
  }): Promise<ProjectReportRow> {
    return await prisma.project_reports.create({ data })
  }

  async update(id: number, data: {
    title?: string | null
    content?: string
    periodEnd?: Date
  }): Promise<ProjectReportRow> {
    return await prisma.project_reports.update({ where: { id }, data })
  }

  async delete(id: number): Promise<void> {
    await prisma.project_reports.delete({ where: { id } })
  }
}
