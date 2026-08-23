import type {
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
import { DeleteWeeklyReportUseCase } from "@/backend/modules/reporting/application/use-cases/delete-weekly-report.use-case"
import { GetWeeklyReportByIdUseCase } from "@/backend/modules/reporting/application/use-cases/get-weekly-report-by-id.use-case"
import { ListWeeklyReportsUseCase } from "@/backend/modules/reporting/application/use-cases/list-weekly-reports.use-case"
import { UpsertWeeklyReportUseCase } from "@/backend/modules/reporting/application/use-cases/upsert-weekly-report.use-case"
import {
  createReportingGateway,
  PrismaReportingGateway,
} from "@/backend/modules/reporting/infrastructure/prisma-reporting.gateway"
import { createNotificationsModule } from "@/backend/modules/notifications"

export class ReportingModule {
  constructor(
    private readonly listWeeklyReportsUseCase: ListWeeklyReportsUseCase,
    private readonly getWeeklyReportByIdUseCase: GetWeeklyReportByIdUseCase,
    private readonly upsertWeeklyReportUseCase: UpsertWeeklyReportUseCase,
    private readonly deleteWeeklyReportUseCase: DeleteWeeklyReportUseCase,
    private readonly _gateway: PrismaReportingGateway,
  ) {}

  // ===== Project Reports (4b) — gateway-backed =====
  async createProjectReport(command: CreateProjectReportCommand) {
    return await this._gateway.createProjectReport(command)
  }
  async updateProjectReport(command: UpdateProjectReportCommand) {
    return await this._gateway.updateProjectReport(command)
  }
  async deleteProjectReport(command: DeleteProjectReportCommand) {
    return await this._gateway.deleteProjectReport(command)
  }
  async getProjectReport(actorUserId: number, actorRoles: string[], reportId: number) {
    return await this._gateway.getProjectReport(actorUserId, actorRoles, reportId)
  }
  async listProjectReports(query: ListProjectReportsQuery) {
    return await this._gateway.listProjectReports(query)
  }
  async aggregateProjectReport(actorUserId: number, actorRoles: string[], reportId: number) {
    return await this._gateway.aggregateProjectReport(actorUserId, actorRoles, reportId)
  }
  async registerReportAttachment(command: RegisterReportAttachmentCommand) {
    return await this._gateway.registerReportAttachment(command)
  }
  async deleteReportAttachment(command: DeleteReportAttachmentCommand) {
    return await this._gateway.deleteReportAttachment(command)
  }
  async sweepStaleReportUploads(maxAgeMs?: number) {
    return await this._gateway.sweepStaleReportUploads(maxAgeMs)
  }

  async listWeeklyReports(query: WeeklyReportListQuery) {
    return await this.listWeeklyReportsUseCase.execute(query)
  }

  async getWeeklyReportById(id: number) {
    return await this.getWeeklyReportByIdUseCase.execute(id)
  }

  async upsertWeeklyReport(command: UpsertWeeklyReportCommand) {
    return await this.upsertWeeklyReportUseCase.execute(command)
  }

  async deleteWeeklyReport(id: number) {
    return await this.deleteWeeklyReportUseCase.execute(id)
  }

  async getProjectHours(query: ProjectHoursQuery) {
    return await this._gateway.getProjectHours(query)
  }

  async getProjectWeeklyHours(projectId: number, weekStart: string) {
    return await this._gateway.getProjectWeeklyHours(projectId, weekStart)
  }

  async getProjectHoursHistory(query: ProjectHoursHistoryQuery) {
    return await this._gateway.getProjectHoursHistory(query)
  }

  async getUserProjectHours(query: UserProjectHoursQuery) {
    return await this._gateway.getUserProjectHours(query)
  }

  async listWeeklyHoursHistory(query: WeeklyHoursHistoryQuery) {
    return await this._gateway.listWeeklyHoursHistory(query)
  }

  async getWeeklyHoursStats() {
    return await this._gateway.getWeeklyHoursStats()
  }

  async resetWeeklyHoursHistory() {
    return await this._gateway.resetWeeklyHoursHistory()
  }

  async createWeeklyHoursHistory(weekStart: string) {
    return await this._gateway.createWeeklyHoursHistory(weekStart)
  }

  async getProjectStats() {
    return await this._gateway.getProjectStats()
  }
}

export interface ReportingModuleFactoryOptions {
  gateway?: PrismaReportingGateway
  notificationsModule?: ReturnType<typeof createNotificationsModule>
}

export function createReportingModule(options: ReportingModuleFactoryOptions = {}) {
  const gateway =
    options.gateway ??
    createReportingGateway({
      notificationsModule: options.notificationsModule ?? createNotificationsModule(),
    })

  return new ReportingModule(
    new ListWeeklyReportsUseCase(gateway),
    new GetWeeklyReportByIdUseCase(gateway),
    new UpsertWeeklyReportUseCase(gateway),
    new DeleteWeeklyReportUseCase(gateway),
    gateway,
  )
}
