import type { GamificationGateway } from "@/backend/modules/gamification/application/ports/gamification.gateway"

export class UserProgressionEngine {
  constructor(private readonly gateway: GamificationGateway) {}

  async execute(userId: number) {
    return await this.gateway.getUserProgression(userId)
  }
}

// Compatibilidade temporária com nome legado
export class GetUserProgressionUseCase extends UserProgressionEngine {}
