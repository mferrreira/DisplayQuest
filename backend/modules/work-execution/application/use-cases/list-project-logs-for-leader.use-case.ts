import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"
import type {
  ListProjectLogsForLeaderCommand,
  ProjectLogsForLeaderResult,
} from "@/backend/modules/work-execution/application/contracts"

export class ListProjectLogsForLeaderUseCase {
  constructor(private readonly gateway: WorkExecutionGateway) {}

  async execute(command: ListProjectLogsForLeaderCommand): Promise<ProjectLogsForLeaderResult> {
    return await this.gateway.listProjectLogsForLeader(command)
  }
}
