// @vitest-environment node
/**
 * T0.4 round-trip gate: entity Zod schemas MUST accept real persisted rows
 * after JSON serialization (what the API actually transports).
 * Read-only against the dev database.
 */
import { describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  userSchema,
  taskSchema,
  projectSchema,
  workSessionSchema,
  rewardSchema,
  purchaseSchema,
  issueSchema,
  badgeSchema,
  notificationSchema,
  labResponsibilitySchema,
} from "@/entities";

const prisma = new PrismaClient();

function first<T>(rows: T[]): T {
  if (rows.length === 0) throw new Error("expected at least one row");
  return rows[0];
}

describe("entities round-trip vs live database", () => {
  it("userSchema accepts a real user row", async () => {
    const row = first(await prisma.users.findMany({ take: 1 }));
    expect(userSchema.safeParse(JSON.parse(JSON.stringify(row))).success).toBe(true);
  });

  it("taskSchema accepts a real task row", async () => {
    const row = first(await prisma.tasks.findMany({ take: 1 }));
    const parsed = taskSchema.safeParse(JSON.parse(JSON.stringify(row)));
    if (!parsed.success) throw new Error(`task schema mismatch: ${parsed.error.message}`);
    expect(parsed.success).toBe(true);
  });

  it("projectSchema accepts a real project row", async () => {
    const row = first(await prisma.projects.findMany({ take: 1 }));
    const parsed = projectSchema.safeParse(JSON.parse(JSON.stringify(row)));
    if (!parsed.success) throw new Error(`project schema mismatch: ${parsed.error.message}`);
    expect(parsed.success).toBe(true);
  });

  it("workSessionSchema accepts a real session row", async () => {
    const row = first(await prisma.work_sessions.findMany({ take: 1 }));
    const parsed = workSessionSchema.safeParse(JSON.parse(JSON.stringify(row)));
    if (!parsed.success) throw new Error(`session schema mismatch: ${parsed.error.message}`);
    expect(parsed.success).toBe(true);
  });

  it("purchase schema accepts backend-domain rows and REJECTS legacy statuses (D-8)", async () => {
    const reward = first(await prisma.rewards.findMany({ take: 1 }));
    expect(rewardSchema.safeParse(JSON.parse(JSON.stringify(reward))).success).toBe(true);

    // Current-backend domain only (store-service.gateway.ts writes these).
    const currentDomain = ["pending", "approved", "rejected", "completed", "cancelled"];
    const purchases = await prisma.purchases.findMany();
    const modernRow = purchases.find((p) => currentDomain.includes(p.status));
    if (!modernRow) throw new Error("no purchase row with a current-domain status found");
    const parsedPurchase = purchaseSchema.safeParse(JSON.parse(JSON.stringify(modernRow)));
    if (!parsedPurchase.success)
      throw new Error(`purchase schema mismatch: ${parsedPurchase.error.message}`);
    expect(parsedPurchase.success).toBe(true);

    // Legacy rows ("delivered"/"processing") predate the store module and MUST fail parsing —
    // this encodes the contract so mocks/UI cannot silently accept fiction.
    const legacyRow = purchases.find(
      (p) => !currentDomain.includes(p.status),
    );
    if (legacyRow) {
      expect(purchaseSchema.safeParse(JSON.parse(JSON.stringify(legacyRow))).success).toBe(false);
    }
  });

  it("issueSchema accepts a real issue row", async () => {
    const row = first(await prisma.issues.findMany({ take: 1 }));
    const parsed = issueSchema.safeParse(JSON.parse(JSON.stringify(row)));
    if (!parsed.success) throw new Error(`issue schema mismatch: ${parsed.error.message}`);
    expect(parsed.success).toBe(true);
  });

  it("badgeSchema accepts a real badge row", async () => {
    const row = first(await prisma.badges.findMany({ take: 1 }));
    const parsed = badgeSchema.safeParse(JSON.parse(JSON.stringify(row)));
    if (!parsed.success) throw new Error(`badge schema mismatch: ${parsed.error.message}`);
    expect(parsed.success).toBe(true);
  });

  it("notificationSchema accepts a real notification row", async () => {
    const row = first(await prisma.notifications.findMany({ take: 1 }));
    const parsed = notificationSchema.safeParse(JSON.parse(JSON.stringify(row)));
    if (!parsed.success) throw new Error(`notification schema mismatch: ${parsed.error.message}`);
    expect(parsed.success).toBe(true);
  });

  it("labResponsibilitySchema accepts a real responsibility row", async () => {
    const row = first(await prisma.lab_responsibilities.findMany({ take: 1 }));
    const parsed = labResponsibilitySchema.safeParse(JSON.parse(JSON.stringify(row)));
    if (!parsed.success)
      throw new Error(`responsibility schema mismatch: ${parsed.error.message}`);
    expect(parsed.success).toBe(true);
  });
});
