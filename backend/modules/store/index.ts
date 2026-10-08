import type { ListPurchasesResult, ListPurchasesScopeInput, PatchPurchaseCommand, PatchRewardCommand } from "@/backend/modules/store/application/contracts"
import {
  CreateRewardUseCase,
  DeleteRewardUseCase,
  GetRewardUseCase,
  ListRewardsUseCase,
  PatchRewardUseCase,
  UpdateRewardUseCase,
} from "@/backend/modules/store/application/use-cases/reward.use-cases"
import {
  CreatePurchaseUseCase,
  DeletePurchaseUseCase,
  GetPurchaseUseCase,
  ListPurchasesUseCase,
  PatchPurchaseUseCase,
  UpdatePurchaseUseCase,
  AssertCanManagePurchasesUseCase,
} from "@/backend/modules/store/application/use-cases/purchase.use-cases"
import type { ActorRef } from "@/backend/domain"
import type { PurchaseRepository } from "@/backend/modules/store/application/ports/purchase.repository"
import type { RewardRepository } from "@/backend/modules/store/application/ports/reward.repository"
import { PrismaPurchaseRepository } from "@/backend/modules/store/infrastructure/repositories/prisma-purchase.repository"
import { PrismaRewardRepository } from "@/backend/modules/store/infrastructure/repositories/prisma-reward.repository"

/**
 * OND8-B3 — the store facade. THE PUBLIC SURFACE IS UNCHANGED (12 methods, same names and
 * shapes — routes keep compiling). What changed: every method now runs through a USE CASE
 * holding the rules (R1) over thin table-level ports; the fat `StoreServiceGateway` was
 * removed in OND9-B1 (repo-cleanup B8, 2026-10-01) together with the golden/contract seam
 * — old behavior preserved in git (tag `pre-cleanup`). DEC-23 (owner-approved): the new
 * wiring FIXES QUIRK-8S1 — reward writes only real schema columns, so PUT/PATCH
 * /api/rewards/[id] works again.
 */
export class StoreModule {
  constructor(
    private readonly listRewardsUseCase: ListRewardsUseCase,
    private readonly getRewardUseCase: GetRewardUseCase,
    private readonly createRewardUseCase: CreateRewardUseCase,
    private readonly updateRewardUseCase: UpdateRewardUseCase,
    private readonly patchRewardUseCase: PatchRewardUseCase,
    private readonly deleteRewardUseCase: DeleteRewardUseCase,
    private readonly listPurchasesUseCase: ListPurchasesUseCase,
    private readonly assertCanManagePurchasesUseCase: AssertCanManagePurchasesUseCase,
    private readonly getPurchaseUseCase: GetPurchaseUseCase,
    private readonly createPurchaseUseCase: CreatePurchaseUseCase,
    private readonly updatePurchaseUseCase: UpdatePurchaseUseCase,
    private readonly patchPurchaseUseCase: PatchPurchaseUseCase,
    private readonly deletePurchaseUseCase: DeletePurchaseUseCase,
  ) {}

  readonly listRewards = () => this.listRewardsUseCase.execute()
  readonly getReward = (rewardId: number) => this.getRewardUseCase.execute(rewardId)
  // B6-2a: o ator entra no comando — o gate de MANAGE_REWARDS mora nos use cases (DEC-53).
  readonly createReward = (command: { actorRoles: unknown; data: Record<string, unknown> }) =>
    this.createRewardUseCase.execute(command)
  readonly updateReward = (command: { actorRoles: unknown; rewardId: number; data: Record<string, unknown> }) =>
    this.updateRewardUseCase.execute(command)
  readonly patchReward = (command: PatchRewardCommand & { actorRoles: unknown }) =>
    this.patchRewardUseCase.execute(command)
  readonly deleteReward = (command: { actorRoles: unknown; rewardId: number }) =>
    this.deleteRewardUseCase.execute(command)

  // B6-2d (D4): os seis metodos de compra passaram a levar o ator — a autoridade mora nos
  // use cases (self-or-manage em create/get/cancel, MANAGE_PURCHASES puro em update/delete/
  // demais actions). `assertCanManagePurchases` existe porque o gate do PUT rodava ANTES de
  // o corpo ser lido: a rota autoriza antes do parse e updatePurchase recheca no proprio ator.
  readonly listPurchases = (input: ListPurchasesScopeInput): Promise<ListPurchasesResult> =>
    this.listPurchasesUseCase.execute(input)
  readonly assertCanManagePurchases = (command: { actor: ActorRef }): void =>
    this.assertCanManagePurchasesUseCase.execute(command)
  readonly getPurchase = (actor: ActorRef, purchaseId: number) =>
    this.getPurchaseUseCase.execute(actor, purchaseId)
  readonly createPurchase = (command: { actor: ActorRef; data: Record<string, unknown> }) =>
    this.createPurchaseUseCase.execute(command)
  readonly updatePurchase = (command: { actor: ActorRef; purchaseId: number; data: Record<string, unknown> }) =>
    this.updatePurchaseUseCase.execute(command)
  readonly patchPurchase = (command: PatchPurchaseCommand & { actor: ActorRef }) =>
    this.patchPurchaseUseCase.execute(command)
  readonly deletePurchase = (command: { actor: ActorRef; purchaseId: number }) =>
    this.deletePurchaseUseCase.execute(command)
}

export interface StoreModulePorts {
  rewards?: RewardRepository
  purchases?: PurchaseRepository
}

export interface StoreModuleFactoryOptions {
  ports?: StoreModulePorts
}

export function createStoreModule(options: StoreModuleFactoryOptions = {}) {
  const rewards = options.ports?.rewards ?? new PrismaRewardRepository()
  const purchases = options.ports?.purchases ?? new PrismaPurchaseRepository()

  const updatePurchase = new UpdatePurchaseUseCase(purchases)

  return new StoreModule(
    new ListRewardsUseCase(rewards),
    new GetRewardUseCase(rewards),
    new CreateRewardUseCase(rewards),
    new UpdateRewardUseCase(rewards),
    new PatchRewardUseCase(rewards),
    new DeleteRewardUseCase(rewards),
    new ListPurchasesUseCase(purchases),
    new AssertCanManagePurchasesUseCase(),
    new GetPurchaseUseCase(purchases),
    new CreatePurchaseUseCase(purchases, rewards),
    updatePurchase,
    new PatchPurchaseUseCase(purchases, updatePurchase),
    new DeletePurchaseUseCase(purchases),
  )
}
