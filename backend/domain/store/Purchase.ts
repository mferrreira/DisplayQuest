/**
 * Purchase / Reward — pure domain contracts of the store aggregate (SPEC §4.5).
 *
 * `PurchaseStatus` mirrors the statuses the current gateway writes (pending -> approved |
 * rejected, approved -> completed, pending|approved -> cancelled). The legacy `delivered` /
 * `processing` rows discovery D-8 talks about are DATA, not domain values, and stay out.
 *
 * `purchaseDate` is typed `Date` because that is what the model class guarantees after
 * `fromPrisma` (`new Date(data.purchaseDate)`), even though the column itself is a String.
 */
export type PurchaseStatus = "pending" | "approved" | "rejected" | "completed" | "cancelled";

export interface IPurchase {
  id?: number;
  userId: number;
  rewardId: number;
  rewardName: string;
  price: number;
  purchaseDate: Date;
  status: PurchaseStatus;
}

export type Purchase = IPurchase;

export interface IReward {
  id?: number;
  name: string;
  description?: string | null;
  price: number;
  available: boolean;
  categoryId?: number | null;
  stock?: number | null;
  imageUrl?: string | null;
}

export type Reward = IReward;
