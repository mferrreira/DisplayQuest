import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"
import type { WorkExecutionEvents } from "@/backend/modules/work-execution/application/ports/work-execution.events"
import type { CronOperationsPort } from "@/backend/modules/work-execution/application/ports/cron-operations.port"
import { ExecuteManualCronResetUseCase } from "@/backend/modules/work-execution/application/use-cases/execute-manual-cron-reset.use-case"
import { GetCronStatusUseCase } from "@/backend/modules/work-execution/application/use-cases/get-cron-status.use-case"
import { createCronOperationsAdapter } from "@/backend/modules/work-execution/infrastructure/cron-operations.adapter"
import type { DailyLogRepositoryPort } from "@/backend/modules/work-execution/application/ports/daily-log.repository"
import type { ProjectAccessPort } from "@/backend/modules/work-execution/application/ports/project-access.port"
import type { TaskVerificationPort } from "@/backend/modules/work-execution/application/ports/task-verification.port"
import type { WorkSessionRepositoryPort } from "@/backend/modules/work-execution/application/ports/work-session.repository"
import { CompleteWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/complete-work-session.use-case"
import { CreateDailyLogFromSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/create-daily-log-from-session.use-case"
import { DeleteWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/delete-work-session.use-case"
import { GetDailyLogByIdUseCase } from "@/backend/modules/work-execution/application/use-cases/get-daily-log-by-id.use-case"
import { GetWorkSessionByIdUseCase } from "@/backend/modules/work-execution/application/use-cases/get-work-session-by-id.use-case"
import { ListDailyLogsUseCase } from "@/backend/modules/work-execution/application/use-cases/list-daily-logs.use-case"
import { ListProjectLogsForLeaderUseCase } from "@/backend/modules/work-execution/application/use-cases/list-project-logs-for-leader.use-case"
import { ListWorkSessionsUseCase } from "@/backend/modules/work-execution/application/use-cases/list-work-sessions.use-case"
import { StartWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/start-work-session.use-case"
import { UpdateWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/update-work-session.use-case"
import { createPrismaDailyLogRepository } from "@/backend/modules/work-execution/infrastructure/repositories/prisma-daily-log.repository"
import { createPrismaProjectAccess } from "@/backend/modules/work-execution/infrastructure/repositories/prisma-project-access"
import { createPrismaTaskVerification } from "@/backend/modules/work-execution/infrastructure/repositories/prisma-task-verification"
import { createPrismaWorkSessionRepository } from "@/backend/modules/work-execution/infrastructure/repositories/prisma-work-session.repository"

type GatewayCall<T> = T extends (...args: infer A) => infer R ? (...args: A) => R : never

/** B6-1b (D4): the cron surface is two use cases, not part of WorkExecutionGateway. */
export interface WorkExecutionCronSurface {
  getCronStatusForActor: GatewayCall<GetCronStatusUseCase["execute"]>
  executeManualCronActionForActor: GatewayCall<ExecuteManualCronResetUseCase["execute"]>
}

/**
 * WorkExecutionModule — public surface: the same 10 methods the routes consume today
 * (WorkExecutionGateway). OND3-B2: the rules moved from the fat gateway into the use cases;
 * the module is now composed from repository ports (DEC-15/17).
 */
export class WorkExecutionModule {
  readonly startWorkSession: GatewayCall<WorkExecutionGateway["startWorkSession"]>
  readonly completeWorkSession: GatewayCall<WorkExecutionGateway["completeWorkSession"]>
  readonly createDailyLogFromSession: GatewayCall<WorkExecutionGateway["createDailyLogFromSession"]>
  readonly listWorkSessions: GatewayCall<WorkExecutionGateway["listWorkSessions"]>
  readonly listDailyLogs: GatewayCall<WorkExecutionGateway["listDailyLogs"]>
  readonly listProjectLogsForLeader: GatewayCall<WorkExecutionGateway["listProjectLogsForLeader"]>
  readonly deleteWorkSession: GatewayCall<WorkExecutionGateway["deleteWorkSession"]>
  readonly updateWorkSession: GatewayCall<WorkExecutionGateway["updateWorkSession"]>
  readonly getSessionById: GatewayCall<WorkExecutionGateway["getSessionById"]>
  readonly getDailyLogById: GatewayCall<WorkExecutionGateway["getDailyLogById"]>
  // B6-1b: the authorization for /api/cron/status is enforced here, not in the route.
  readonly getCronStatusForActor: WorkExecutionCronSurface["getCronStatusForActor"]
  readonly executeManualCronActionForActor: WorkExecutionCronSurface["executeManualCronActionForActor"]

  constructor(private readonly service: WorkExecutionGateway, cron: WorkExecutionCronSurface) {
    this.startWorkSession = this.service.startWorkSession.bind(this.service)
    this.completeWorkSession = this.service.completeWorkSession.bind(this.service)
    this.createDailyLogFromSession = this.service.createDailyLogFromSession.bind(this.service)
    this.listWorkSessions = this.service.listWorkSessions.bind(this.service)
    this.listDailyLogs = this.service.listDailyLogs.bind(this.service)
    this.listProjectLogsForLeader = this.service.listProjectLogsForLeader.bind(this.service)
    this.deleteWorkSession = this.service.deleteWorkSession.bind(this.service)
    this.updateWorkSession = this.service.updateWorkSession.bind(this.service)
    this.getSessionById = this.service.getSessionById.bind(this.service)
    this.getDailyLogById = this.service.getDailyLogById.bind(this.service)
    this.getCronStatusForActor = cron.getCronStatusForActor
    this.executeManualCronActionForActor = cron.executeManualCronActionForActor
  }
}

export interface WorkExecutionModuleFactoryOptions {
  /** Primary seam (OND3-B2, DEC-17): inject fake ports in tests. */
  ports?: {
    workSessions?: WorkSessionRepositoryPort
    dailyLogs?: DailyLogRepositoryPort
    projectAccess?: ProjectAccessPort
    taskVerification?: TaskVerificationPort
    /** B6-1b: the scheduler seam. Defaults to the adapter over the cronService singleton. */
    cronOperations?: CronOperationsPort
  }
  /** Events port; the composition root wires the gamification awards into the publisher. */
  events?: WorkExecutionEvents
}

export function createWorkExecutionModule(options: WorkExecutionModuleFactoryOptions = {}) {
  const workSessions = options.ports?.workSessions ?? createPrismaWorkSessionRepository()
  const dailyLogs = options.ports?.dailyLogs ?? createPrismaDailyLogRepository()
  const projectAccess = options.ports?.projectAccess ?? createPrismaProjectAccess()
  const taskVerification = options.ports?.taskVerification ?? createPrismaTaskVerification()
  const cronOperations = options.ports?.cronOperations ?? createCronOperationsAdapter()

  const completeWorkSessionUseCase = new CompleteWorkSessionUseCase(
    { workSessions, dailyLogs, projectAccess, taskVerification },
    options.events,
  )

  const service: WorkExecutionGateway = {
    startWorkSession: (command) =>
      new StartWorkSessionUseCase({ workSessions, projectAccess }).execute(command),
    completeWorkSession: (command) => completeWorkSessionUseCase.execute(command),
    createDailyLogFromSession: (command) =>
      new CreateDailyLogFromSessionUseCase({ workSessions, dailyLogs }).execute(command),
    listWorkSessions: (query) => new ListWorkSessionsUseCase({ workSessions }).execute(query),
    listDailyLogs: (query) => new ListDailyLogsUseCase({ dailyLogs }).execute(query),
    listProjectLogsForLeader: (command) =>
      new ListProjectLogsForLeaderUseCase({ projectAccess }).execute(command),
    deleteWorkSession: (command) => new DeleteWorkSessionUseCase({ workSessions }).execute(command),
    updateWorkSession: (command) =>
      new UpdateWorkSessionUseCase({ workSessions, projectAccess, taskVerification }).execute(command),
    getSessionById: (sessionId) => new GetWorkSessionByIdUseCase({ workSessions }).execute(sessionId),
    getDailyLogById: (logId) => new GetDailyLogByIdUseCase({ dailyLogs }).execute(logId),
  }

  const cron: WorkExecutionCronSurface = {
    getCronStatusForActor: (command) =>
      new GetCronStatusUseCase(() => cronOperations.getStatus()).execute(command),
    executeManualCronActionForActor: (command) =>
      new ExecuteManualCronResetUseCase(() => cronOperations.executeManualReset()).execute(command),
  }

  return new WorkExecutionModule(service, cron)
}
