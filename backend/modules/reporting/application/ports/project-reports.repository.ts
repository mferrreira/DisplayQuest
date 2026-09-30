/** project_reports row (prisma/schema.prisma :195). */
export interface ProjectReportRow {
  id: number
  projectId: number
  authorId: number
  periodType: string
  periodStart: Date
  periodEnd: Date
  title: string | null
  content: string
  createdAt: Date
  updatedAt: Date
}

export interface ProjectReportAttachmentRow {
  id: number
  fileName: string
  storedPath: string
  mimeType: string
  sizeBytes: number
  createdAt: Date
}

export interface ProjectReportWithRelations extends ProjectReportRow {
  project: { name: string } | null
  author: { name: string } | null
  attachments: ProjectReportAttachmentRow[]
}

/**
 * OND7-B3 — thin repository over `project_reports`.
 * `findIds` receives the where FRAGMENT as built by the use case — including the frozen
 * QUIRK-7M collision (from/to spread over the same `periodStart` key, `to` wins). The
 * repository must not merge the bounds itself.
 */
export interface ProjectReportsRepository {
  findById(id: number): Promise<ProjectReportRow | null>
  findProjectId(id: number): Promise<{ projectId: number } | null>
  findWithRelations(id: number): Promise<ProjectReportWithRelations | null>
  /** Compound unique (projectId, periodType, periodStart, authorId). */
  findIdByCompound(compound: {
    projectId: number
    periodType: string
    periodStart: Date
    authorId: number
  }): Promise<{ id: number } | null>
  findIds(query: {
    projectIds?: number[]
    periodType?: string
    authorId?: number
    periodStart?: { gte?: Date; lte?: Date }
  }): Promise<Array<{ id: number }>>
  create(data: {
    projectId: number
    authorId: number
    periodType: string
    periodStart: Date
    periodEnd: Date
    title: string | null
    content: string
  }): Promise<ProjectReportRow>
  update(id: number, data: {
    title?: string | null
    content?: string
    periodEnd?: Date
  }): Promise<ProjectReportRow>
  /** Schema cascade: deleting a report removes its attachment ROWS (files are removed
   * explicitly by the use case via ReportStoragePort before the delete). */
  delete(id: number): Promise<void>
}
