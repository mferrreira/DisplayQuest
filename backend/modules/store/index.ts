import type { StoreGateway } from "@/backend/modules/store/application/ports/store.gateway"
import { createStoreGateway } from "@/backend/modules/store/infrastructure/store-service.gateway"

type GatewayCall<T> = T extends (...args: infer A) => infer R ? (...args: A) => R : never

export class StoreModule {
  readonly listRewards: GatewayCall<StoreGateway["listRewards"]>
  readonly getReward: GatewayCall<StoreGateway["getReward"]>
  readonly createReward: GatewayCall<StoreGateway["createReward"]>
  readonly updateReward: GatewayCall<StoreGateway["updateReward"]>
  readonly patchReward: GatewayCall<StoreGateway["patchReward"]>
  readonly deleteReward: GatewayCall<StoreGateway["deleteReward"]>
  readonly listPurchases: GatewayCall<StoreGateway["listPurchases"]>
  readonly getPurchase: GatewayCall<StoreGateway["getPurchase"]>
  readonly createPurchase: GatewayCall<StoreGateway["createPurchase"]>
  readonly updatePurchase: GatewayCall<StoreGateway["updatePurchase"]>
  readonly patchPurchase: GatewayCall<StoreGateway["patchPurchase"]>
  readonly deletePurchase: GatewayCall<StoreGateway["deletePurchase"]>

  constructor(private readonly gateway: StoreGateway) {
    this.listRewards = this.gateway.listRewards.bind(this.gateway)
    this.getReward = this.gateway.getReward.bind(this.gateway)
    this.createReward = this.gateway.createReward.bind(this.gateway)
    this.updateReward = this.gateway.updateReward.bind(this.gateway)
    this.patchReward = this.gateway.patchReward.bind(this.gateway)
    this.deleteReward = this.gateway.deleteReward.bind(this.gateway)
    this.listPurchases = this.gateway.listPurchases.bind(this.gateway)
    this.getPurchase = this.gateway.getPurchase.bind(this.gateway)
    this.createPurchase = this.gateway.createPurchase.bind(this.gateway)
    this.updatePurchase = this.gateway.updatePurchase.bind(this.gateway)
    this.patchPurchase = this.gateway.patchPurchase.bind(this.gateway)
    this.deletePurchase = this.gateway.deletePurchase.bind(this.gateway)
  }
}

export interface StoreModuleFactoryOptions {
  gateway?: StoreGateway
}

export function createStoreModule(options: StoreModuleFactoryOptions = {}) {
  return new StoreModule(options.gateway ?? createStoreGateway())
}
