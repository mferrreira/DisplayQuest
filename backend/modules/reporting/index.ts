import type {
  BulkGenerateWeeklyReportsCommand,
  CreateProjectReportCommand,
  DeleteProjectReportCommand,
  DeleteReportAttachmentCommand,
  ListProjectReportsQuery,
  ProjectHoursHistoryQuery,
  ProjectHoursQuery,
  RegisterReportAttachmentCommand,
  UpdateProjectReportCommand,
  UpsertWeeklyReportCommand,
  UserProjectHoursQuery,
  WeeklyHoursHistoryQuery,
  WeeklyReportListQuery,
} from "@/backend/modules/reporting/application/contracts"
import { AggregateProjectReportUseCase } from "@/backend/modules/reporting/application/use-cases/aggregate-project-report.use-case"
import { BulkGenerateWeeklyReportsUseCase } from "@/backend/modules/reporting/application/use-cases/bulk-generate-weekly-reports.use-case"
import { CreateProjectReportUseCase } from "@/backend/modules/reporting/application/use-cases/create-project-report.use-case"
import { CreateWeeklyHoursHistoryUseCase } from "@/backend/modules/reporting/application/use-cases/create-weekly-hours-history.use-case"
import { DeleteProjectReportUseCase } from "@/backend/modules/reporting/application/use-cases/delete-project-report.use-case"
import { DeleteReportAttachmentUseCase } from "@/backend/modules/reporting/application/use-cases/delete-report-attachment.use-case"
import { DeleteWeeklyReportUseCase } from "@/backend/modules/reporting/application/use-cases/delete-weekly-report.use-case"
import { GetProjectHoursHistoryUseCase } from "@/backend/modules/reporting/application/use-cases/get-project-hours-history.use-case"
import { GetProjectHoursUseCase } from "@/backend/modules/reporting/application/use-cases/get-project-hours.use-case"
import { GetProjectReportUseCase } from "@/backend/modules/reporting/application/use-cases/get-project-report.use-case"
import { GetProjectStatsUseCase } from "@/backend/modules/reporting/application/use-cases/get-project-stats.use-case"
import { GetProjectWeeklyHoursUseCase } from "@/backend/modules/reporting/application/use-cases/get-project-weekly-hours.use-case"
import { GetUserProjectHoursUseCase } from "@/backend/modules/reporting/application/use-cases/get-user-project-hours.use-case"
import { GetWeeklyHoursStatsUseCase } from "@/backend/modules/reporting/application/use-cases/get-weekly-hours-stats.use-case"
import { GetWeeklyReportByIdUseCase } from "@/backend/modules/reporting/application/use-cases/get-weekly-report-by-id.use-case"
import { ListProjectReportsUseCase } from "@/backend/modules/reporting/application/use-cases/list-project-reports.use-case"
import { ListWeeklyHoursHistoryUseCase } from "@/backend/modules/reporting/application/use-cases/list-weekly-hours-history.use-case"
import { ListWeeklyReportsUseCase } from "@/backend/modules/reporting/application/use-cases/list-weekly-reports.use-case"
import { RegisterReportAttachmentUseCase } from "@/backend/modules/reporting/application/use-cases/register-report-attachment.use-case"
import { ResetWeeklyHoursHistoryUseCase } from "@/backend/modules/reporting/application/use-cases/reset-weekly-hours-history.use-case"
import { SweepStaleReportUploadsUseCase } from "@/backend/modules/reporting/application/use-cases/sweep-stale-report-uploads.use-case"
import { UpdateProjectReportUseCase } from "@/backend/modules/reporting/application/use-cases/update-project-report.use-case"
import { UpsertWeeklyReportUseCase } from "@/backend/modules/reporting/application/use-cases/upsert-weekly-report.use-case"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"
import type { ProjectReportsRepository } from "@/backend/modules/reporting/application/ports/project-reports.repository"
import type { ReportAttachmentsRepository } from "@/backend/modules/reporting/application/ports/report-attachments.repository"
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port"
import type { ReportStoragePort } from "@/backend/modules/reporting/application/ports/report-storage.port"
import type { ReportSubmittedPublisherPort } from "@/backend/modules/reporting/application/ports/report-submitted-publisher.port"
import type { WeeklyHoursHistoryRepository } from "@/backend/modules/reporting/application/ports/weekly-hours-history.repository"
import type { WeeklyReportsRepository } from "@/backend/modules/reporting/application/ports/weekly-reports.repository"
import { PrismaHoursReadRepository } from "@/backend/modules/reporting/infrastructure/repositories/prisma-hours-read.repository"
import { PrismaProjectReportsRepository } from "@/backend/modules/reporting/infrastructure/repositories/prisma-project-reports.repository"
import { PrismaReportAttachmentsRepository } from "@/backend/modules/reporting/infrastructure/repositories/prisma-report-attachments.repository"
import { PrismaReportingDirectory } from "@/backend/modules/reporting/infrastructure/repositories/prisma-reporting-directory"
import { PrismaWeeklyHoursHistoryRepository } from "@/backend/modules/reporting/infrastructure/repositories/prisma-weekly-hours-history.repository"
import { PrismaWeeklyReportsRepository } from "@/backend/modules/reporting/infrastructure/repositories/prisma-weekly-reports.repository"
import { ReportUploadsStorage } from "@/backend/modules/reporting/infrastructure/publishers/report-uploads-storage"

/**
 * OND7-B3 — the reporting facade. THE PUBLIC SURFACE IS UNCHANGED (22 methods, same names
 * and shapes — routes keep compiling until OND7-B4 migrates them to domainErrorResponse).
 * What changed: every method now runs through a USE CASE holding the rules (R1) over thin
 * table-level ports; the fat `PrismaReportingGateway` is no longer wired (it survives
 * untouched as the golden/contract seam — DEC-15, removal task OND9-B1).
 */
export class ReportingModule {
  constructor(
    private readonly listWeeklyReportsUseCase: ListWeeklyReportsUseCase,
    private readonly getWeeklyReportByIdUseCase: GetWeeklyReportByIdUseCase,
    private readonly upsertWeeklyReportUseCase: UpsertWeeklyReportUseCase,
    private readonly deleteWeeklyReportUseCase: DeleteWeeklyReportUseCase,
    private readonly bulkGenerateWeeklyReportsUseCase: BulkGenerateWeeklyReportsUseCase,
    private readonly getProjectHoursUseCase: GetProjectHoursUseCase,
    private readonly getProjectWeeklyHoursUseCase: GetProjectWeeklyHoursUseCase,
    private readonly getProjectHoursHistoryUseCase: GetProjectHoursHistoryUseCase,
    private readonly getUserProjectHoursUseCase: GetUserProjectHoursUseCase,
    private readonly listWeeklyHoursHistoryUseCase: ListWeeklyHoursHistoryUseCase,
    private readonly getWeeklyHoursStatsUseCase: GetWeeklyHoursStatsUseCase,
    private readonly resetWeeklyHoursHistoryUseCase: ResetWeeklyHoursHistoryUseCase,
    private readonly createWeeklyHoursHistoryUseCase: CreateWeeklyHoursHistoryUseCase,
    private readonly getProjectStatsUseCase: GetProjectStatsUseCase,
    private readonly createProjectReportUseCase: CreateProjectReportUseCase,
    private readonly updateProjectReportUseCase: UpdateProjectReportUseCase,
    private readonly deleteProjectReportUseCase: DeleteProjectReportUseCase,
    private readonly getProjectReportUseCase: GetProjectReportUseCase,
    private readonly listProjectReportsUseCase: ListProjectReportsUseCase,
    private readonly aggregateProjectReportUseCase: AggregateProjectReportUseCase,
    private readonly registerReportAttachmentUseCase: RegisterReportAttachmentUseCase,
    private readonly deleteReportAttachmentUseCase: DeleteReportAttachmentUseCase,
    private readonly sweepStaleReportUploadsUseCase: SweepStaleReportUploadsUseCase,
  ) {}

  async listWeeklyReports(query: WeeklyReportListQuery) {
    return await this.listWeeklyReportsUseCase.execute(query)
  }

  async getWeeklyReportById(id: number) {
    return await this.getWeeklyReportByIdUseCase.execute(id)
  }

  async upsertWeeklyReport(command: UpsertWeeklyReportCommand) {
    return await this.upsertWeeklyReportUseCase.execute(command)
  }

  async bulkGenerateWeeklyReports(command: BulkGenerateWeeklyReportsCommand) {
    return await this.bulkGenerateWeeklyReportsUseCase.execute(command)
  }

  async deleteWeeklyReport(id: number) {
    return await this.deleteWeeklyReportUseCase.execute(id)
  }

  async getProjectHours(query: ProjectHoursQuery) {
    return await this.getProjectHoursUseCase.execute(query)
  }

  async getProjectWeeklyHours(projectId: number, weekStart: string) {
    return await this.getProjectWeeklyHoursUseCase.execute(projectId, weekStart)
  }

  async getProjectHoursHistory(query: ProjectHoursHistoryQuery) {
    return await this.getProjectHoursHistoryUseCase.execute(query)
  }

  async getUserProjectHours(query: UserProjectHoursQuery) {
    return await this.getUserProjectHoursUseCase.execute(query)
  }

  async listWeeklyHoursHistory(query: WeeklyHoursHistoryQuery) {
    return await this.listWeeklyHoursHistoryUseCase.execute(query)
  }

  async getWeeklyHoursStats() {
    return await this.getWeeklyHoursStatsUseCase.execute()
  }

  async resetWeeklyHoursHistory() {
    return await this.resetWeeklyHoursHistoryUseCase.execute()
  }

  async createWeeklyHoursHistory(weekStart: string) {
    return await this.createWeeklyHoursHistoryUseCase.execute(weekStart)
  }

  async getProjectStats() {
    return await this.getProjectStatsUseCase.execute()
  }

  async createProjectReport(command: CreateProjectReportCommand) {
    return await this.createProjectReportUseCase.execute(command)
  }

  async updateProjectReport(command: UpdateProjectReportCommand) {
    return await this.updateProjectReportUseCase.execute(command)
  }

  async deleteProjectReport(command: DeleteProjectReportCommand) {
    return await this.deleteProjectReportUseCase.execute(command)
  }

  async getProjectReport(actorUserId: number, actorRoles: string[], reportId: number) {
    return await this.getProjectReportUseCase.execute(actorUserId, actorRoles, reportId)
  }

  async listProjectReports(query: ListProjectReportsQuery) {
    return await this.listProjectReportsUseCase.execute(query)
  }

  async aggregateProjectReport(actorUserId: number, actorRoles: string[], reportId: number) {
    return await this.aggregateProjectReportUseCase.execute(actorUserId, actorRoles, reportId)
  }

  async registerReportAttachment(command: RegisterReportAttachmentCommand) {
    return await this.registerReportAttachmentUseCase.execute(command)
  }

  async deleteReportAttachment(command: DeleteReportAttachmentCommand) {
    return await this.deleteReportAttachmentUseCase.execute(command)
  }

  async sweepStaleReportUploads(maxAgeMs?: number) {
    return await this.sweepStaleReportUploadsUseCase.execute(maxAgeMs)
  }
}

/** Thin ports of the module (DEC-17: the seam tests inject; production defaults to Prisma). */
export interface ReportingModulePorts {
  weeklyReports?: WeeklyReportsRepository
  hoursRead?: HoursReadRepository
  weeklyHoursHistory?: WeeklyHoursHistoryRepository
  projectReports?: ProjectReportsRepository
  reportAttachments?: ReportAttachmentsRepository
  directory?: ReportingDirectory
  storage?: ReportStoragePort
  publisher?: ReportSubmittedPublisherPort
}

/** Publisher used when the composition root does not wire one (tests/default): no-op with a
 * loud console trace so a forgotten wiring cannot rot silently. */
class UnwiredReportSubmittedPublisher implements ReportSubmittedPublisherPort {
  async publishSubmitted(event: { reportId: number }): Promise<void> {
    console.warn(`[reporting] publisher não conectado — evento PROJECT_REPORT_SUBMITTED descartado (reportId=${event.reportId}).`)
  }
}

export interface ReportingModuleFactoryOptions {
  ports?: ReportingModulePorts
}

export function createReportingModule(options: ReportingModuleFactoryOptions = {}) {
  const weeklyReports = options.ports?.weeklyReports ?? new PrismaWeeklyReportsRepository()
  const hoursRead = options.ports?.hoursRead ?? new PrismaHoursReadRepository()
  const weeklyHoursHistory = options.ports?.weeklyHoursHistory ?? new PrismaWeeklyHoursHistoryRepository()
  const projectReports = options.ports?.projectReports ?? new PrismaProjectReportsRepository()
  const reportAttachments = options.ports?.reportAttachments ?? new PrismaReportAttachmentsRepository()
  const directory = options.ports?.directory ?? new PrismaReportingDirectory()
  const storage = options.ports?.storage ?? new ReportUploadsStorage()
  const publisher = options.ports?.publisher ?? new UnwiredReportSubmittedPublisher()

  const getProjectReport = new GetProjectReportUseCase(projectReports, directory)
  const upsertWeeklyReport = new UpsertWeeklyReportUseCase(weeklyReports, hoursRead, directory)

  return new ReportingModule(
    new ListWeeklyReportsUseCase(weeklyReports, hoursRead),
    new GetWeeklyReportByIdUseCase(weeklyReports, hoursRead),
    upsertWeeklyReport,
    new DeleteWeeklyReportUseCase(weeklyReports),
    // Bulk (feature 64a6095) portado para a wiring nova: compoe o MESMO UpsertWeeklyReportUseCase
    // (paridade do upsert ja pinada no contract suite) + directory.findActiveUsers.
    new BulkGenerateWeeklyReportsUseCase(upsertWeeklyReport, directory),
    new GetProjectHoursUseCase(hoursRead),
    new GetProjectWeeklyHoursUseCase(hoursRead),
    new GetProjectHoursHistoryUseCase(hoursRead),
    new GetUserProjectHoursUseCase(hoursRead, directory),
    new ListWeeklyHoursHistoryUseCase(weeklyHoursHistory),
    new GetWeeklyHoursStatsUseCase(weeklyHoursHistory),
    new ResetWeeklyHoursHistoryUseCase(hoursRead, weeklyHoursHistory, directory),
    new CreateWeeklyHoursHistoryUseCase(hoursRead, weeklyHoursHistory, directory),
    new GetProjectStatsUseCase(hoursRead, directory),
    new CreateProjectReportUseCase(projectReports, directory, publisher),
    new UpdateProjectReportUseCase(projectReports),
    new DeleteProjectReportUseCase(projectReports, reportAttachments, storage),
    getProjectReport,
    new ListProjectReportsUseCase(projectReports, directory),
    new AggregateProjectReportUseCase(hoursRead, getProjectReport),
    new RegisterReportAttachmentUseCase(projectReports, reportAttachments),
    new DeleteReportAttachmentUseCase(reportAttachments, storage),
    new SweepStaleReportUploadsUseCase(reportAttachments, storage),
  )
}
