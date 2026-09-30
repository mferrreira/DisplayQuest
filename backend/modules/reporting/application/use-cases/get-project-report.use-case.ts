import { ForbiddenError, NotFoundError } from "@/backend/domain/errors"
import { canManageProjectReports, decideReportViewAccess } from "@/backend/domain/reporting"
import type { ProjectReportReadModel } from "@/backend/modules/reporting/application/contracts"
import type { ProjectReportsRepository } from "@/backend/modules/reporting/application/ports/project-reports.repository"
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port"
import { toProjectReportReadModel } from "./project-report-read-model"

/**
 * OND7-B3 — frozen from getProjectReport (gateway:866-878): a missing id THROWS
 * "Relatório não encontrado" (the null return in the legacy signature is unreachable).
 * View access: MANAGE_USERS or the project leader.
 */
export class GetProjectReportUseCase {
  constructor(
    private readonly projectReports: ProjectReportsRepository,
    private readonly directory: ReportingDirectory,
  ) {}

  async execute(actorUserId: number, actorRoles: string[], reportId: number): Promise<ProjectReportReadModel> {
    const existing = await this.projectReports.findProjectId(reportId)
    if (!existing) {
      throw new NotFoundError("Relatório não encontrado")
    }

    const isManagement = canManageProjectReports(actorRoles)
    if (!isManagement) {
      const isLeader = await this.directory.isProjectLeader(existing.projectId, actorUserId)
      if (decideReportViewAccess(false, isLeader) !== "ok") {
        throw new ForbiddenError("Acesso negado")
      }
    }

    const report = await this.projectReports.findWithRelations(reportId)
    return toProjectReportReadModel(report!)
  }
}
