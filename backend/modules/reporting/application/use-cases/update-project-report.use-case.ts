import { ForbiddenError, NotFoundError } from "@/backend/domain/errors"
import { canManageProjectReports, decideReportEditAccess } from "@/backend/domain/reporting"
import type { UpdateProjectReportCommand, ProjectReportReadModel } from "@/backend/modules/reporting/application/contracts"
import type { ProjectReportsRepository } from "@/backend/modules/reporting/application/ports/project-reports.repository"
import { toProjectReportReadModel } from "./project-report-read-model"

/**
 * OND7-B3 — frozen from updateProjectReport (gateway:830-849). Partial update: omitted
 * fields preserved, explicit null zeroes the column. QUIRK-7F: content is NOT validated
 * here (empty string accepted — contrast with create).
 */
export class UpdateProjectReportUseCase {
  constructor(private readonly projectReports: ProjectReportsRepository) {}

  async execute(command: UpdateProjectReportCommand): Promise<ProjectReportReadModel> {
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

    await this.projectReports.update(command.reportId, {
      ...(command.title !== undefined ? { title: command.title } : {}),
      ...(command.content !== undefined ? { content: command.content } : {}),
    })

    const report = await this.projectReports.findWithRelations(command.reportId)
    return toProjectReportReadModel(report!)
  }
}
