/**
 * STORE entities — prisma/schema.prisma `rewards` (:133–140) and `purchases` (:142–152).
 *
 * Purchase status domain = CURRENT backend truth (store-service.gateway.ts):
 *   pending → approved (approve) | rejected (reject/deny, refunds points)
 *   approved → completed (complete)
 *   pending|approved → cancelled (cancel, refunds points)
 * ⚠ Legacy rows with "delivered"/"processing" exist in the dev DB (discovery D-8) and are
 *   intentionally REJECTED by this schema — see tests/integration/entities-roundtrip.test.ts.
 */
import { z } from "zod";
import { dateTimeString } from "./user";

export const purchaseStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "completed",
  "cancelled",
]);
/** Statuses written only by pre-refactor app versions; never produced by the current backend. */
export const LEGACY_PURCHASE_STATUSES = ["delivered", "processing"] as const;

export const rewardSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable().optional(),
  price: z.number().int(),
  available: z.boolean().default(true),
});
export type Reward = z.infer<typeof rewardSchema>;

export const purchaseSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  rewardId: z.number().int(),
  rewardName: z.string(),
  price: z.number().int(),
  purchaseDate: z.string(), // DB stores String — parse defensively
  status: purchaseStatusSchema,
});
export type Purchase = z.infer<typeof purchaseSchema>;
