import { ForbiddenError, NotFoundError } from "@/backend/domain/errors"
import { canManageProjectReports, decideReportEditAccess } from "@/backend/domain/reporting"
import type { ProjectReportReadModel, RegisterReportAttachmentCommand } from "@/backend/modules/reporting/application/contracts"
import type { ProjectReportsRepository } from "@/backend/modules/reporting/application/ports/project-reports.repository"
import type { ReportAttachmentsRepository } from "@/backend/modules/reporting/application/ports/report-attachments.repository"
import { toProjectReportReadModel } from "./project-report-read-model"

/** OND7-B3 — frozen from registerReportAttachment (gateway:973-992): existence -> edit
 * access (MANAGE_USERS or author) -> create row (uploadedBy = actor) -> read model. */
export class RegisterReportAttachmentUseCase {
  constructor(
    private readonly projectReports: ProjectReportsRepository,
    private readonly attachments: ReportAttachmentsRepository,
  ) {}

  async execute(command: RegisterReportAttachmentCommand): Promise<ProjectReportReadModel> {
    const existing = await this.projectReports.findById(command.reportId)
    if (!existing) {
      throw new NotFoundError("Relatório não encontrado")
    }

    const decision = decideReportEditAccess(
      canManageProjectReports(command.actorRoles),
      existing.authorId === command.actorUserId,
    )
    if (decision !== "ok") {
      throw new ForbiddenError("Acesso negado")
    }

    await this.attachments.create({
      reportId: command.reportId,
      fileName: command.fileName,
      storedPath: command.storedPath,
      mimeType: command.mimeType,
      sizeBytes: command.sizeBytes,
      uploadedBy: command.actorUserId,
    })

    const report = await this.projectReports.findWithRelations(command.reportId)
    return toProjectReportReadModel(report!)
  }
}
