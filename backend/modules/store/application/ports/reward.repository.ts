import type { IReward, RewardInputFields } from "@/backend/domain"

/**
 * OND8-B3 — porta fina de `rewards` (R2). Table-level only; nenhuma regra.
 * `update` escreve APENAS os campos presentes no patch — e o adapter só conhece colunas
 * reais do schema (DEC-23: conserta o QUIRK-8S1 na wiring nova; o gateway legado é o
 * seam antigo indexado pelo contract test).
 */
export interface RewardRepository {
  findById(id: number): Promise<IReward | null>
  findAll(): Promise<IReward[]>
  create(input: Required<RewardInputFields>): Promise<IReward>
  update(id: number, fields: RewardInputFields): Promise<IReward>
  delete(id: number): Promise<void>
}
