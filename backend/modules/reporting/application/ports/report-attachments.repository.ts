/** report_attachments row (prisma/schema.prisma :214). */
export interface ReportAttachmentRow {
  id: number
  reportId: number
  fileName: string
  storedPath: string
  mimeType: string
  sizeBytes: number
  uploadedBy: number
  createdAt: Date
}

/** OND7-B3 — thin repository over `report_attachments`. */
export interface ReportAttachmentsRepository {
  findByReport(reportId: number): Promise<ReportAttachmentRow[]>
  findById(id: number): Promise<ReportAttachmentRow | null>
  findAllStoredPaths(): Promise<string[]>
  create(data: {
    reportId: number
    fileName: string
    storedPath: string
    mimeType: string
    sizeBytes: number
    uploadedBy: number
  }): Promise<ReportAttachmentRow>
  delete(id: number): Promise<void>
}
