import { assertPermission, NotFoundError } from "@/backend/domain"
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
 *
 * B6-2a (D4, DEC-53) — os 4 use cases de escrita passam a RECEBER o ator e a exigir
 * MANAGE_REWARDS, que a rota decidia com `ensurePermission(actor, "MANAGE_REWARDS")` **sem
 * mensagem** (por isso o default "Acesso negado" do `assertPermission`, e não uma string nova).
 * As leituras (List/Get) seguem sem ator: a rota exige sessão, e sessão não é autorização.
 *
 * A checagem vem ANTES de qualquer regra: o gate legado rodava antes de o corpo ser lido, e
 * inverter essa ordem daria 400 a quem não tem permissão.
 *
 * `PatchRewardCommand` continua sendo o contrato da porta; o ator viaja em `actorRoles`, campo
 * novo que o `computeRewardPatchFields` ignora.
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

  async execute(command: { actorRoles: unknown; data: Record<string, unknown> }) {
    assertPermission(command.actorRoles, "MANAGE_REWARDS")
    const input = normalizeRewardCreate(command.data)
    return await this.rewards.create(input)
  }
}

export class UpdateRewardUseCase {
  constructor(private readonly rewards: RewardRepository) {}

  async execute(command: { actorRoles: unknown; rewardId: number; data: Record<string, unknown> }) {
    assertPermission(command.actorRoles, "MANAGE_REWARDS")
    const current = await this.rewards.findById(command.rewardId)
    if (!current) throw new NotFoundError("Recompensa não encontrada")

    const fields = computeRewardUpdateFields(command.data)
    return await this.rewards.update(command.rewardId, fields)
  }
}

export class PatchRewardUseCase {
  constructor(private readonly rewards: RewardRepository) {}

  async execute(command: {
    actorRoles: unknown
    rewardId: number
    action?: string
    updateData?: Record<string, unknown>
  }) {
    assertPermission(command.actorRoles, "MANAGE_REWARDS")
    const reward = await this.rewards.findById(command.rewardId)
    if (!reward) throw new NotFoundError("Recompensa não encontrada")

    const fields = computeRewardPatchFields(reward, command.action, command.updateData)
    return await this.rewards.update(command.rewardId, fields)
  }
}

export class DeleteRewardUseCase {
  constructor(private readonly rewards: RewardRepository) {}

  async execute(command: { actorRoles: unknown; rewardId: number }): Promise<void> {
    assertPermission(command.actorRoles, "MANAGE_REWARDS")
    const reward = await this.rewards.findById(command.rewardId)
    if (!reward) throw new NotFoundError("Recompensa não encontrada")
    await this.rewards.delete(command.rewardId)
  }
}