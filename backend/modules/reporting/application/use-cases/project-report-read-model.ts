import { projectReportPeriodLabel } from "@/backend/domain/reporting"
import type {
  ProjectReportAttachmentDto,
  ProjectReportPeriodType,
  ProjectReportReadModel,
} from "@/backend/modules/reporting/application/contracts"
import type { ProjectReportWithRelations } from "@/backend/modules/reporting/application/ports/project-reports.repository"

/**
 * OND7-B3 — pure read-model builder extracted from buildProjectReportReadModel
 * (gateway:697-733). Same field order, same ISO conversion, same QUIRK-7E label rule
 * (weekly -> date-fns LOCAL format; others -> SP-anchored computeReportPeriod label).
 */
export function toProjectReportReadModel(report: ProjectReportWithRelations): ProjectReportReadModel {
  const attachments: ProjectReportAttachmentDto[] = report.attachments.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    storedPath: a.storedPath,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt.toISOString(),
  }))

  return {
    id: report.id,
    projectId: report.projectId,
    projectName: report.project?.name ?? "",
    authorId: report.authorId,
    authorName: report.author?.name ?? "",
    periodType: report.periodType as ProjectReportPeriodType,
    periodLabel: projectReportPeriodLabel(
      report.periodType as ProjectReportPeriodType,
      report.periodStart,
      report.periodEnd,
    ),
    periodStart: report.periodStart.toISOString(),
    periodEnd: report.periodEnd.toISOString(),
    title: report.title,
    content: report.content,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    attachments,
  }
}
