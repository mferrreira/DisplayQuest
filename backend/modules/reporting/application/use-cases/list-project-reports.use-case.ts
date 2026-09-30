import { ForbiddenError } from "@/backend/domain/errors"
import { canManageProjectReports, decideReportListAccess } from "@/backend/domain/reporting"
import type { ListProjectReportsQuery, ProjectReportReadModel } from "@/backend/modules/reporting/application/contracts"
import type { ProjectReportsRepository } from "@/backend/modules/reporting/application/ports/project-reports.repository"
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port"
import { toProjectReportReadModel } from "./project-report-read-model"

/**
 * OND7-B3 — frozen from listProjectReports (gateway:880-911). QUIRK-7J: a non-manager with
 * no led projects is denied even without a projectId filter. QUIRK-7M: `from` and `to`
 * collide on the SAME `periodStart` key of the where spread — `to` (lte) overwrites `from`
 * (gte); the collision is reproduced here verbatim (the repository receives the fragment
 * as-built).
 */
export class ListProjectReportsUseCase {
  constructor(
    private readonly projectReports: ProjectReportsRepository,
    private readonly directory: ReportingDirectory,
  ) {}

  async execute(query: ListProjectReportsQuery): Promise<ProjectReportReadModel[]> {
    const isManager = canManageProjectReports(query.actorRoles)
    let projectFilter: number[] | undefined = query.projectId ? [query.projectId] : undefined

    if (!isManager) {
      const ledProjectIds = await this.directory.findLedProjectIds(query.actorUserId)
      const decision = decideReportListAccess(false, query.projectId, ledProjectIds)
      if (!decision.allowed) {
        throw new ForbiddenError("Acesso negado")
      }
      projectFilter = decision.projectFilter
    }

    const rows = await this.projectReports.findIds({
      ...(projectFilter ? { projectIds: projectFilter } : {}),
      ...(query.periodType ? { periodType: query.periodType } : {}),
      ...(query.authorId ? { authorId: query.authorId } : {}),
      ...(query.from ? { periodStart: { gte: new Date(query.from) } } : {}),
      ...(query.to ? { periodStart: { lte: new Date(query.to) } } : {}),
    })

    const models = await Promise.all(
      rows.map(async (row) => {
        const report = await this.projectReports.findWithRelations(row.id)
        return report ? toProjectReportReadModel(report) : null
      }),
    )
    return models.filter(Boolean) as ProjectReportReadModel[]
  }
}
