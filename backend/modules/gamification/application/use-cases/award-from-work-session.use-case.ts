import type { AwardFromWorkSessionCommand } from "@/backend/modules/gamification/application/contracts"
import type { GamificationGateway } from "@/backend/modules/gamification/application/ports/gamification.gateway"

export class WorkSessionProgressionEngine {
  constructor(private readonly gateway: GamificationGateway) {}

  async execute(command: AwardFromWorkSessionCommand) {
    return await this.gateway.awardFromWorkSession(command)
  }
}

// Compatibilidade temporária com nome legado
export class AwardFromWorkSessionUseCase extends WorkSessionProgressionEngine {}
