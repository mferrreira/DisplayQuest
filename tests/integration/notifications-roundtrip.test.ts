// @vitest-environment node
/**
 * OND1-B2 — G4 roundtrip smoke of the notifications module against the ISOLATED test DB
 * (127.0.0.1:5433 — DEC-10/BLOCKER-02; never 5432).
 *
 * Exercises the NEW wiring end-to-end with real Prisma (no mocks):
 *   publish -> list -> markAsRead -> markAllAsRead -> delete
 * using `createNotificationsModule()` exactly as the composition root builds it
 * (NotificationsGatewayAdapter over PrismaNotificationRepository, rules in the use cases).
 *
 * Only rows created by this file are deleted in afterAll; seeded data is left in place.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createNotificationsModule } from "@/backend/modules/notifications";

const notificationsModule = createNotificationsModule();
const createdIds: number[] = [];
let userId = 0;

describe("G4 roundtrip — notifications (isolated test DB)", () => {
  beforeAll(async () => {
    const user = await prisma.users.findFirst({
      where: { status: "active" },
      select: { id: true },
    });
    if (!user) {
      throw new Error("G4 harness: no active user in the test DB — re-run seed + g4-normalize.sql");
    }
    userId = user.id;
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.notifications.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it("publish -> list -> markAsRead -> markAllAsRead -> delete keeps the frozen semantics", async () => {
    const before = await notificationsModule.listUserNotifications(userId);

    const result = await notificationsModule.publishEvent({
      eventType: "G4_SMOKE",
      title: "G4 smoke",
      message: "roundtrip",
      data: { probe: 1 },
      audience: { mode: "USER_IDS", userIds: [userId] },
    });
    expect(result.createdCount).toBe(1);
    expect(result.recipients).toEqual([userId]);

    const after = await notificationsModule.listUserNotifications(userId);
    expect(after.length).toBe(before.length + 1);

    const created = after.find((item) => item.type === "G4_SMOKE" && item.title === "G4 smoke");
    expect(created).toBeDefined();
    createdIds.push(created!.id);
    // envelope frozen by the golden matrix: stored as a JSON string, returned UNPARSED
    expect(created!.data).toBe('{"probe":1}');
    expect(created!.read).toBe(false);
    expect(created!.readAt).toBeNull();

    expect(await notificationsModule.markAsRead(userId, created!.id)).toBe(true);
    const marked = (await notificationsModule.listUserNotifications(userId)).find(
      (item) => item.id === created!.id,
    );
    expect(marked?.read).toBe(true);
    expect(marked?.readAt).not.toBeNull();

    expect(await notificationsModule.markAllAsRead(userId)).toBeGreaterThanOrEqual(0);

    expect(await notificationsModule.deleteUserNotification(userId, created!.id)).toBe(true);
    const finalList = await notificationsModule.listUserNotifications(userId);
    expect(finalList.find((item) => item.id === created!.id)).toBeUndefined();
    expect(finalList.length).toBe(before.length);
  });

  it("ownership scope holds against the real DB: another user cannot mark/delete my row", async () => {
    const other = await prisma.users.findFirst({
      where: { status: "active", id: { not: userId } },
      select: { id: true },
    });

    const result = await notificationsModule.publishEvent({
      eventType: "G4_SMOKE_2",
      title: "G4 smoke 2",
      message: "ownership",
      audience: { mode: "USER_IDS", userIds: [userId] },
    });
    const row = await prisma.notifications.findFirst({
      where: { userId, type: "G4_SMOKE_2" },
      orderBy: { id: "desc" },
    });
    expect(row).toBeDefined();
    createdIds.push(row!.id);
    expect(result.createdCount).toBe(1);

    if (other) {
      expect(await notificationsModule.markAsRead(other.id, row!.id)).toBe(false);
      expect(await notificationsModule.deleteUserNotification(other.id, row!.id)).toBe(false);
    }

    expect(await notificationsModule.deleteUserNotification(userId, row!.id)).toBe(true);
  });
});
