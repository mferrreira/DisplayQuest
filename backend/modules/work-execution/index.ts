import { StartWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/start-work-session.use-case"
import { CompleteWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/complete-work-session.use-case"
import { CreateDailyLogFromSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/create-daily-log-from-session.use-case"
import { ListWorkSessionsUseCase } from "@/backend/modules/work-execution/application/use-cases/list-work-sessions.use-case"
import { ListDailyLogsUseCase } from "@/backend/modules/work-execution/application/use-cases/list-daily-logs.use-case"
import { DeleteWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/delete-work-session.use-case"
import { UpdateWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/update-work-session.use-case"
import { GetWorkSessionByIdUseCase } from "@/backend/modules/work-execution/application/use-cases/get-work-session-by-id.use-case"
import { GetDailyLogByIdUseCase } from "@/backend/modules/work-execution/application/use-cases/get-daily-log-by-id.use-case"
import { createWorkExecutionEventsPublisher } from "@/backend/modules/work-execution/infrastructure/work-execution-events.publisher"
import {
  createWorkExecutionGateway,
} from "@/backend/modules/work-execution/infrastructure/work-session-service.gateway"

type UseCaseExecute<T> = T extends { execute: (...args: infer A) => infer R } ? (...args: A) => R : never

export class WorkExecutionModule {
  readonly startWorkSession: UseCaseExecute<StartWorkSessionUseCase>
  readonly completeWorkSession: UseCaseExecute<CompleteWorkSessionUseCase>
  readonly createDailyLogFromSession: UseCaseExecute<CreateDailyLogFromSessionUseCase>
  readonly listWorkSessions: UseCaseExecute<ListWorkSessionsUseCase>
  readonly listDailyLogs: UseCaseExecute<ListDailyLogsUseCase>
  readonly deleteWorkSession: UseCaseExecute<DeleteWorkSessionUseCase>
  readonly updateWorkSession: UseCaseExecute<UpdateWorkSessionUseCase>
  readonly getSessionById: UseCaseExecute<GetWorkSessionByIdUseCase>
  readonly getDailyLogById: UseCaseExecute<GetDailyLogByIdUseCase>

  constructor(
    private readonly startWorkSessionUseCase: StartWorkSessionUseCase,
    private readonly completeWorkSessionUseCase: CompleteWorkSessionUseCase,
    private readonly createDailyLogFromSessionUseCase: CreateDailyLogFromSessionUseCase,
    private readonly listWorkSessionsUseCase: ListWorkSessionsUseCase,
    private readonly listDailyLogsUseCase: ListDailyLogsUseCase,
    private readonly deleteWorkSessionUseCase: DeleteWorkSessionUseCase,
    private readonly updateWorkSessionUseCase: UpdateWorkSessionUseCase,
    private readonly getWorkSessionByIdUseCase: GetWorkSessionByIdUseCase,
    private readonly getDailyLogByIdUseCase: GetDailyLogByIdUseCase,
  ) {
    this.startWorkSession = this.startWorkSessionUseCase.execute.bind(this.startWorkSessionUseCase)
    this.completeWorkSession = this.completeWorkSessionUseCase.execute.bind(this.completeWorkSessionUseCase)
    this.createDailyLogFromSession = this.createDailyLogFromSessionUseCase.execute.bind(this.createDailyLogFromSessionUseCase)
    this.listWorkSessions = this.listWorkSessionsUseCase.execute.bind(this.listWorkSessionsUseCase)
    this.listDailyLogs = this.listDailyLogsUseCase.execute.bind(this.listDailyLogsUseCase)
    this.deleteWorkSession = this.deleteWorkSessionUseCase.execute.bind(this.deleteWorkSessionUseCase)
    this.updateWorkSession = this.updateWorkSessionUseCase.execute.bind(this.updateWorkSessionUseCase)
    this.getSessionById = this.getWorkSessionByIdUseCase.execute.bind(this.getWorkSessionByIdUseCase)
    this.getDailyLogById = this.getDailyLogByIdUseCase.execute.bind(this.getDailyLogByIdUseCase)
  }
}

export function createWorkExecutionModule() {
  const gateway = createWorkExecutionGateway()
  const eventsPublisher = createWorkExecutionEventsPublisher()

  return new WorkExecutionModule(
    new StartWorkSessionUseCase(gateway),
    new CompleteWorkSessionUseCase(gateway, eventsPublisher),
    new CreateDailyLogFromSessionUseCase(gateway),
    new ListWorkSessionsUseCase(gateway),
    new ListDailyLogsUseCase(gateway),
    new DeleteWorkSessionUseCase(gateway),
    new UpdateWorkSessionUseCase(gateway),
    new GetWorkSessionByIdUseCase(gateway),
    new GetDailyLogByIdUseCase(gateway),
  )
}
