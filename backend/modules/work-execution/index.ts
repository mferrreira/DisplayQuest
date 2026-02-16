import type {
  CompleteWorkSessionCommand,
  CreateDailyLogFromSessionCommand,
  DeleteWorkSessionCommand,
  ListWorkSessionsQuery,
  StartWorkSessionCommand,
  UpdateWorkSessionCommand,
} from "@/backend/modules/work-execution/application/contracts"
import { StartWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/start-work-session.use-case"
import { CompleteWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/complete-work-session.use-case"
import { CreateDailyLogFromSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/create-daily-log-from-session.use-case"
import { ListWorkSessionsUseCase } from "@/backend/modules/work-execution/application/use-cases/list-work-sessions.use-case"
import { DeleteWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/delete-work-session.use-case"
import { UpdateWorkSessionUseCase } from "@/backend/modules/work-execution/application/use-cases/update-work-session.use-case"
import { createWorkExecutionEventsPublisher } from "@/backend/modules/work-execution/infrastructure/work-execution-events.publisher"
import {
  createWorkExecutionGateway,
  WorkSessionServiceGateway,
} from "@/backend/modules/work-execution/infrastructure/work-session-service.gateway"

export class WorkExecutionModule {
  constructor(
    private readonly startWorkSessionUseCase: StartWorkSessionUseCase,
    private readonly completeWorkSessionUseCase: CompleteWorkSessionUseCase,
    private readonly createDailyLogFromSessionUseCase: CreateDailyLogFromSessionUseCase,
    private readonly listWorkSessionsUseCase: ListWorkSessionsUseCase,
    private readonly deleteWorkSessionUseCase: DeleteWorkSessionUseCase,
    private readonly updateWorkSessionUseCase: UpdateWorkSessionUseCase,
    private readonly gateway: WorkSessionServiceGateway,
  ) {}

  async startWorkSession(command: StartWorkSessionCommand) {
    return await this.startWorkSessionUseCase.execute(command)
  }

  async completeWorkSession(command: CompleteWorkSessionCommand) {
    return await this.completeWorkSessionUseCase.execute(command)
  }

  async createDailyLogFromSession(command: CreateDailyLogFromSessionCommand) {
    return await this.createDailyLogFromSessionUseCase.execute(command)
  }

  async listWorkSessions(query: ListWorkSessionsQuery) {
    return await this.listWorkSessionsUseCase.execute(query)
  }

  async deleteWorkSession(command: DeleteWorkSessionCommand) {
    return await this.deleteWorkSessionUseCase.execute(command)
  }

  async updateWorkSession(command: UpdateWorkSessionCommand) {
    return await this.updateWorkSessionUseCase.execute(command)
  }

  async getSessionById(sessionId: number) {
    return await this.gateway.getSessionById(sessionId)
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
    new DeleteWorkSessionUseCase(gateway),
    new UpdateWorkSessionUseCase(gateway),
    gateway,
  )
}
