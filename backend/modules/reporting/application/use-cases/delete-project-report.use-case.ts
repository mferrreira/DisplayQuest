import { ForbiddenError, NotFoundError } from "@/backend/domain/errors"
import { canManageProjectReports, decideReportDeleteAccess } from "@/backend/domain/reporting"
import type { DeleteProjectReportCommand } from "@/backend/modules/reporting/application/contracts"
import type { ProjectReportsRepository } from "@/backend/modules/reporting/application/ports/project-reports.repository"
import type { ReportAttachmentsRepository } from "@/backend/modules/reporting/application/ports/report-attachments.repository"
import type { ReportStoragePort } from "@/backend/modules/reporting/application/ports/report-storage.port"

/**
 * OND7-B3 — frozen from deleteProjectReport (gateway:851-864). QUIRK-7G: MANAGE_USERS only
 * (the author cannot delete their own report); role checked BEFORE existence. Attachment
 * FILES are removed via the storage port (failures swallowed) before the row delete, whose
 * schema cascade removes the attachment rows.
 */
export class DeleteProjectReportUseCase {
  constructor(
    private readonly projectReports: ProjectReportsRepository,
    private readonly attachments: ReportAttachmentsRepository,
    private readonly storage: ReportStoragePort,
  ) {}

  async execute(command: DeleteProjectReportCommand): Promise<void> {
    if (decideReportDeleteAccess(canManageProjectReports(command.actorRoles)) !== "ok") {
      throw new ForbiddenError("Acesso negado")
    }

    const existing = await this.projectReports.findById(command.reportId)
    if (!existing) {
      throw new NotFoundError("Relatório não encontrado")
    }

    const reportAttachments = await this.attachments.findByReport(command.reportId)
    for (const attachment of reportAttachments) {
      await this.storage.removeFile(attachment.storedPath).catch(() => undefined)
    }

    await this.projectReports.delete(command.reportId)
  }
}
