import { ForbiddenError, NotFoundError } from "@/backend/domain/errors"
import { canManageProjectReports, decideAttachmentDeleteAccess } from "@/backend/domain/reporting"
import type { DeleteReportAttachmentCommand } from "@/backend/modules/reporting/application/contracts"
import type { ReportAttachmentsRepository } from "@/backend/modules/reporting/application/ports/report-attachments.repository"
import type { ReportStoragePort } from "@/backend/modules/reporting/application/ports/report-storage.port"

/** OND7-B3 — frozen from deleteReportAttachment (gateway:994-1003): existence -> access
 * (MANAGE_USERS or uploader) -> remove FILE (swallowed) -> delete row. */
export class DeleteReportAttachmentUseCase {
  constructor(
    private readonly attachments: ReportAttachmentsRepository,
    private readonly storage: ReportStoragePort,
  ) {}

  async execute(command: DeleteReportAttachmentCommand): Promise<void> {
    const attachment = await this.attachments.findById(command.attachmentId)
    if (!attachment) {
      throw new NotFoundError("Anexo não encontrado")
    }

    const decision = decideAttachmentDeleteAccess(
      canManageProjectReports(command.actorRoles),
      attachment.uploadedBy === command.actorUserId,
    )
    if (decision !== "ok") {
      throw new ForbiddenError("Acesso negado")
    }

    await this.storage.removeFile(attachment.storedPath).catch(() => undefined)
    await this.attachments.delete(command.attachmentId)
  }
}
