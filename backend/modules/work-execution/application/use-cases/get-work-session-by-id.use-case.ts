import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"

export class GetWorkSessionByIdUseCase {
  constructor(private readonly gateway: WorkExecutionGateway) {}

  async execute(sessionId: number) {
    return await this.gateway.getSessionById(sessionId)
  }
}
