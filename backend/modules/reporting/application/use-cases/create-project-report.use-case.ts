import { ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain/errors"
import {
  canManageProjectReports,
  computeReportPeriod,
  decideReportCreateAccess,
  hasValidReportContent,
  isReportPeriod,
} from "@/backend/domain/reporting"
import type { CreateProjectReportCommand, ProjectReportReadModel } from "@/backend/modules/reporting/application/contracts"
import type { ProjectReportsRepository } from "@/backend/modules/reporting/application/ports/project-reports.repository"
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port"
import type { ReportSubmittedPublisherPort } from "@/backend/modules/reporting/application/ports/report-submitted-publisher.port"
import { toProjectReportReadModel } from "./project-report-read-model"

/**
 * OND7-B3 — frozen from createProjectReport (gateway:763-828).
 * Order frozen: access (project -> management -> leader) -> content -> periodType ->
 * reference. Upsert on the compound (projectId, periodType, periodStart, authorId);
 * notification ONLY on creation, recipients queried + publish inside the swallowing
 * try/catch (console.error), projectName lookup OUTSIDE it (frozen).
 */
export class CreateProjectReportUseCase {
  constructor(
    private readonly projectReports: ProjectReportsRepository,
    private readonly directory: ReportingDirectory,
    private readonly publisher: ReportSubmittedPublisherPort,
  ) {}

  async execute(command: CreateProjectReportCommand): Promise<{ report: ProjectReportReadModel; created: boolean }> {
    const isManagement = canManageProjectReports(command.actorRoles)

    const projectExists = await this.directory.projectExists(command.projectId)
    if (!projectExists) {
      throw new NotFoundError("Projeto não encontrado")
    }
    const isLeader = isManagement ? false : await this.directory.isProjectLeader(command.projectId, command.actorUserId)
    if (decideReportCreateAccess(true, isManagement, isLeader) !== "ok") {
      throw new ForbiddenError("Acesso negado")
    }

    if (!hasValidReportContent(command.content)) {
      throw new ValidationError("Dados inválidos: conteúdo obrigatório")
    }
    if (!isReportPeriod(command.periodType)) {
      throw new ValidationError("Dados inválidos: periodicidade inválida")
    }

    const reference = command.reference ? new Date(command.reference) : new Date()
    if (Number.isNaN(reference.getTime())) {
      throw new ValidationError("Dados inválidos: referência inválida")
    }

    const period = computeReportPeriod(command.periodType, reference)

    const existing = await this.projectReports.findIdByCompound({
      projectId: command.projectId,
      periodType: command.periodType,
      periodStart: period.start,
      authorId: command.actorUserId,
    })

    const saved = existing
      ? await this.projectReports.update(existing.id, {
          title: command.title ?? null,
          content: command.content,
          periodEnd: period.end,
        })
      : await this.projectReports.create({
          projectId: command.projectId,
          authorId: command.actorUserId,
          periodType: command.periodType,
          periodStart: period.start,
          periodEnd: period.end,
          title: command.title ?? null,
          content: command.content,
        })

    if (!existing) {
      const projectName = (await this.directory.getProjectName(command.projectId)) ?? ""
      try {
        const recipients = await this.directory.findReportManagers(command.actorUserId)
        const userIds = recipients.map((u) => u.id)
        if (userIds.length > 0) {
          await this.publisher.publishSubmitted({
            reportId: saved.id,
            projectId: saved.projectId,
            authorId: saved.authorId,
            label: period.label,
            projectName,
            userIds,
          })
        }
      } catch (error) {
        console.error("Erro ao notificar gerência sobre relatório:", error)
      }
    }

    const report = await this.projectReports.findWithRelations(saved.id)
    return { report: toProjectReportReadModel(report!), created: !existing }
  }
}
