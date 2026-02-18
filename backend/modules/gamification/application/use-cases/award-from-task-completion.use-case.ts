import type { AwardFromTaskCompletionCommand } from "@/backend/modules/gamification/application/contracts"
import type { GamificationGateway } from "@/backend/modules/gamification/application/ports/gamification.gateway"

export class TaskCompletionProgressionEngine {
  constructor(private readonly gateway: GamificationGateway) {}

  async execute(command: AwardFromTaskCompletionCommand) {
    return await this.gateway.awardFromTaskCompletion(command)
  }
}

// Compatibilidade temporária com nome legado
export class AwardFromTaskCompletionUseCase extends TaskCompletionProgressionEngine {}
