import { NotFoundError } from "@/backend/domain"
import {
  computeRewardPatchFields,
  computeRewardUpdateFields,
  normalizeRewardCreate,
} from "@/backend/domain"
import type { RewardRepository } from "@/backend/modules/store/application/ports/reward.repository"

/**
 * OND8-B3 — use cases de rewards (R1: as regras vivem aqui, sobre a porta fina).
 * Congelados do StoreServiceGateway legado (golden 8.1):
 *  - update/patch: pre-check de existência ("Recompensa não encontrada") e merge/validação
 *    pelas regras puras. A escrita agora usa só colunas reais — QUIRK-8S1 consertado na
 *    wiring nova (DEC-23, aprovado pelo dono); o legado intacto é o seam do contract test.
 *  - patch default (action desconhecida/ausente) aplica updateData (QUIRK-8S8 preservado).
 */

export class ListRewardsUseCase {
  constructor(private readonly rewards: RewardRepository) {}

  async execute() {
    return await this.rewards.findAll()
  }
}

export class GetRewardUseCase {
  constructor(private readonly rewards: RewardRepository) {}

  async execute(rewardId: number) {
    return await this.rewards.findById(rewardId)
  }
}

export class CreateRewardUseCase {
  constructor(private readonly rewards: RewardRepository) {}

  async execute(data: Record<string, unknown>) {
    const input = normalizeRewardCreate(data)
    return await this.rewards.create(input)
  }
}

export class UpdateRewardUseCase {
  constructor(private readonly rewards: RewardRepository) {}

  async execute(rewardId: number, data: Record<string, unknown>) {
    const current = await this.rewards.findById(rewardId)
    if (!current) throw new NotFoundError("Recompensa não encontrada")

    const fields = computeRewardUpdateFields(data)
    return await this.rewards.update(rewardId, fields)
  }
}

export class PatchRewardUseCase {
  constructor(private readonly rewards: RewardRepository) {}

  async execute(command: {
    rewardId: number
    action?: string
    updateData?: Record<string, unknown>
  }) {
    const reward = await this.rewards.findById(command.rewardId)
    if (!reward) throw new NotFoundError("Recompensa não encontrada")

    const fields = computeRewardPatchFields(reward, command.action, command.updateData)
    return await this.rewards.update(command.rewardId, fields)
  }
}

export class DeleteRewardUseCase {
  constructor(private readonly rewards: RewardRepository) {}

  async execute(rewardId: number): Promise<void> {
    const reward = await this.rewards.findById(rewardId)
    if (!reward) throw new NotFoundError("Recompensa não encontrada")
    await this.rewards.delete(rewardId)
  }
}
