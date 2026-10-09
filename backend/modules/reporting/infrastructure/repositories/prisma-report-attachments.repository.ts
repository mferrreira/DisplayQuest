import { prisma } from "@/lib/database/prisma"
import type {
  ReportAttachmentRow,
  ReportAttachmentsRepository,
} from "@/backend/modules/reporting/application/ports/report-attachments.repository"

/** OND7-B3 — thin Prisma adapter over `report_attachments`. */
export class PrismaReportAttachmentsRepository implements ReportAttachmentsRepository {
  async findByReport(reportId: number): Promise<ReportAttachmentRow[]> {
    return await prisma.report_attachments.findMany({ where: { reportId } })
  }

  async findById(id: number): Promise<ReportAttachmentRow | null> {
    return await prisma.report_attachments.findUnique({ where: { id } })
  }

  async findAllStoredPaths(): Promise<string[]> {
    const rows = await prisma.report_attachments.findMany({ select: { storedPath: true } })
    return rows.map((row) => row.storedPath)
  }

  async create(data: {
    reportId: number
    fileName: string
    storedPath: string
    mimeType: string
    sizeBytes: number
    uploadedBy: number
  }): Promise<ReportAttachmentRow> {
    return await prisma.report_attachments.create({ data })
  }

  async delete(id: number): Promise<void> {
    await prisma.report_attachments.delete({ where: { id } })
  }
}
