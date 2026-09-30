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
} from "@/backend/modules/store/application/use-cases/purchase.use-cases"
import type { PurchaseRepository } from "@/backend/modules/store/application/ports/purchase.repository"
import type { RewardRepository } from "@/backend/modules/store/application/ports/reward.repository"
import { PrismaPurchaseRepository } from "@/backend/modules/store/infrastructure/repositories/prisma-purchase.repository"
import { PrismaRewardRepository } from "@/backend/modules/store/infrastructure/repositories/prisma-reward.repository"

/**
 * OND8-B3 — the store facade. THE PUBLIC SURFACE IS UNCHANGED (12 methods, same names and
 * shapes — routes keep compiling). What changed: every method now runs through a USE CASE
 * holding the rules (R1) over thin table-level ports; the fat `StoreServiceGateway` is no
 * longer wired (it survives untouched as the golden/contract seam — DEC-15, removal task
 * OND9-B1). DEC-23 (owner-approved): the new wiring FIXES QUIRK-8S1 — reward writes only
 * real schema columns, so PUT/PATCH /api/rewards/[id] works again.
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
    private readonly getPurchaseUseCase: GetPurchaseUseCase,
    private readonly createPurchaseUseCase: CreatePurchaseUseCase,
    private readonly updatePurchaseUseCase: UpdatePurchaseUseCase,
    private readonly patchPurchaseUseCase: PatchPurchaseUseCase,
    private readonly deletePurchaseUseCase: DeletePurchaseUseCase,
  ) {}

  readonly listRewards = () => this.listRewardsUseCase.execute()
  readonly getReward = (rewardId: number) => this.getRewardUseCase.execute(rewardId)
  readonly createReward = (data: Record<string, unknown>) => this.createRewardUseCase.execute(data)
  readonly updateReward = (rewardId: number, data: Record<string, unknown>) =>
    this.updateRewardUseCase.execute(rewardId, data)
  readonly patchReward = (command: PatchRewardCommand) => this.patchRewardUseCase.execute(command)
  readonly deleteReward = (rewardId: number) => this.deleteRewardUseCase.execute(rewardId)

  readonly listPurchases = (input: ListPurchasesScopeInput): Promise<ListPurchasesResult> =>
    this.listPurchasesUseCase.execute(input)
  readonly getPurchase = (purchaseId: number) => this.getPurchaseUseCase.execute(purchaseId)
  readonly createPurchase = (data: Record<string, unknown>) => this.createPurchaseUseCase.execute(data)
  readonly updatePurchase = (purchaseId: number, data: Record<string, unknown>) =>
    this.updatePurchaseUseCase.execute(purchaseId, data)
  readonly patchPurchase = (command: PatchPurchaseCommand) => this.patchPurchaseUseCase.execute(command)
  readonly deletePurchase = (purchaseId: number) => this.deletePurchaseUseCase.execute(purchaseId)
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
    new GetPurchaseUseCase(purchases),
    new CreatePurchaseUseCase(purchases, rewards),
    updatePurchase,
    new PatchPurchaseUseCase(purchases, updatePurchase),
    new DeletePurchaseUseCase(purchases),
  )
}
