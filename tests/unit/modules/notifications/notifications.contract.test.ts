// @vitest-environment node
/**
 * OND1-B2 (R3) — contract test of the `NotificationsGateway` port.
 *
 * The SAME behavioral matrix runs against:
 *   (a) the legacy `PrismaNotificationsGateway` (the "implementacao antiga indexada no seam"
 *       of PLAN §3 R3 — unchanged, still talking to the mocked prisma seam); and
 *   (b) the new `NotificationsGatewayAdapter` over `PrismaNotificationRepository`.
 *
 * For every case the test compares (1) the returned value and (2) the resulting database
 * state (rows + stored columns). Parity is behavioral, not implementation-replica: the new
 * adapter is thin and the rules moved to the use cases — what must match is what the port
 * contract promises.
 *
 * Port-level inputs are NORMALIZED audiences (the use case guarantees normalization in the
 * new wiring; the legacy gateway normalized internally — idempotent, same observable result).
 */
import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  type Row = {
    id: number;
    userId: number;
    type: string;
    title: string;
    message: string;
    data: string | null;
    read: boolean;
    createdAt: Date;
    readAt: Date | null;
  };

  const BASE = Date.parse("2026-01-01T00:00:00.000Z");

  const state = {
    notifications: [] as Row[],
    users: [] as Array<{ id: number; status: string }>,
    idSeq: 0,
    tsSeq: 0,
    calls: [] as Array<{ method: string; args: any }>,
  };

  const nextTs = () => new Date(BASE + ++state.tsSeq * 1000);

  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => (row as any)[key] === value);

  const prisma = {
    notifications: {
      createMany: async (args: {
        data: Array<{ userId: number; type: string; title: string; message: string; data: string | null }>;
      }) => {
        state.calls.push({ method: "notifications.createMany", args });
        for (const item of args.data) {
          state.notifications.push({
            id: ++state.idSeq,
            userId: item.userId,
            type: item.type,
            title: item.title,
            message: item.message,
            data: item.data,
            read: false,
            createdAt: nextTs(),
            readAt: null,
          });
        }
        return { count: args.data.length };
      },
      findMany: async (args: { where: Record<string, unknown>; orderBy?: Record<string, string> }) => {
        state.calls.push({ method: "notifications.findMany", args });
        const rows = state.notifications.filter((row) => matches(row, args.where));
        if (args.orderBy?.createdAt === "desc") {
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return rows.map((row) => ({ ...row }));
      },
      count: async (args: { where: Record<string, unknown> }) => {
        state.calls.push({ method: "notifications.count", args });
        return state.notifications.filter((row) => matches(row, args.where)).length;
      },
      updateMany: async (args: { where: Record<string, unknown>; data: Partial<Row> }) => {
        state.calls.push({ method: "notifications.updateMany", args });
        let count = 0;
        for (const row of state.notifications) {
          if (matches(row, args.where)) {
            Object.assign(row, args.data);
            count += 1;
          }
        }
        return { count };
      },
      deleteMany: async (args: { where: Record<string, unknown> }) => {
        state.calls.push({ method: "notifications.deleteMany", args });
        const before = state.notifications.length;
        state.notifications = state.notifications.filter((row) => !matches(row, args.where));
        return { count: before - state.notifications.length };
      },
    },
    users: {
      findMany: async (args: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
        state.calls.push({ method: "users.findMany", args });
        return state.users
          .filter((user) =>
            Object.entries(args.where).every(([key, value]) => (user as any)[key] === value),
          )
          .map((user) => ({ id: user.id }));
      },
    },
  };

  function reset() {
    state.notifications = [];
    state.users = [];
    state.idSeq = 0;
    state.tsSeq = 0;
    state.calls = [];
  }

  function seedUser(id: number, status: string) {
    state.users.push({ id, status });
  }

  function seedNotification(partial: Partial<Row> & { userId: number }) {
    state.notifications.push({
      id: partial.id ?? ++state.idSeq,
      type: "TEST_EVENT",
      title: "seed title",
      message: "seed message",
      data: null,
      read: false,
      createdAt: new Date(BASE + ++state.tsSeq * 1000),
      readAt: null,
      ...partial,
    });
  }

  /** DB snapshot with volatile timestamps masked (readAt is stamped with `new Date()`). */
  function snapshotDb() {
    return state.notifications.map((row) => ({
      id: row.id,
      userId: row.userId,
      type: row.type,
      title: row.title,
      message: row.message,
      data: row.data,
      read: row.read,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt ? "<ts>" : null,
    }));
  }

  function maskItem(item: { createdAt?: unknown; readAt?: unknown }) {
    return {
      ...item,
      createdAt: typeof item.createdAt === "string" ? "<ts>" : item.createdAt,
      readAt: item.readAt ? "<ts>" : null,
    };
  }

  return { BASE, state, prisma, reset, seedUser, seedNotification, snapshotDb, maskItem };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: harness.prisma }));

import { PrismaNotificationsGateway } from "@/backend/modules/notifications/infrastructure/prisma-notifications.gateway";
import { NotificationsGatewayAdapter } from "@/backend/modules/notifications/infrastructure/notifications.gateway";
import { PrismaNotificationRepository } from "@/backend/modules/notifications/infrastructure/repositories/prisma-notification.repository";
import type { NotificationsGateway } from "@/backend/modules/notifications/application/ports/notifications.gateway";

type Case = {
  seed?: () => void;
  run: (gateway: NotificationsGateway) => Promise<unknown>;
};

/** Runs the case against legacy and new impls (fresh DB each time) and demands parity. */
async function expectParity(label: string, testCase: Case) {
  harness.reset();
  testCase.seed?.();
  const legacyResult = await testCase.run(new PrismaNotificationsGateway());
  const legacyDb = harness.snapshotDb();

  harness.reset();
  testCase.seed?.();
  const newResult = await testCase.run(
    new NotificationsGatewayAdapter(new PrismaNotificationRepository()),
  );
  const newDb = harness.snapshotDb();

  expect(newResult, label).toEqual(legacyResult);
  expect(newDb, `${label} — db state`).toEqual(legacyDb);
}

describe("contract — NotificationsGateway: legacy gateway vs new adapter (R3 parity)", () => {
  it("publishEvent USER_IDS (normalized input)", async () => {
    await expectParity("publish USER_IDS", {
      run: (gateway) =>
        gateway.publishEvent({
          eventType: "TASK_DONE",
          title: "Titulo",
          message: "Mensagem",
          audience: { mode: "USER_IDS", userIds: [2, 3] },
        }),
    });
  });

  it("publishEvent USER_IDS empty", async () => {
    await expectParity("publish USER_IDS []", {
      run: (gateway) =>
        gateway.publishEvent({
          eventType: "TASK_DONE",
          title: "T",
          message: "M",
          audience: { mode: "USER_IDS", userIds: [] },
        }),
    });
  });

  it("publishEvent data envelope variants (undefined / object / string / null)", async () => {
    await expectParity("publish data variants", {
      run: async (gateway) => {
        const results = [];
        results.push(
          await gateway.publishEvent({
            eventType: "E",
            title: "T",
            message: "M",
            audience: { mode: "USER_IDS", userIds: [11] },
          }),
        );
        results.push(
          await gateway.publishEvent({
            eventType: "E",
            title: "T",
            message: "M",
            data: { a: 1 },
            audience: { mode: "USER_IDS", userIds: [12] },
          }),
        );
        results.push(
          await gateway.publishEvent({
            eventType: "E",
            title: "T",
            message: "M",
            data: "raw",
            audience: { mode: "USER_IDS", userIds: [13] },
          }),
        );
        results.push(
          await gateway.publishEvent({
            eventType: "E",
            title: "T",
            message: "M",
            data: null,
            audience: { mode: "USER_IDS", userIds: [14] },
          }),
        );
        return results;
      },
    });
  });

  it("publishEvent ALL_ACTIVE_USERS (active users only)", async () => {
    await expectParity("publish ALL_ACTIVE_USERS", {
      seed: () => {
        harness.seedUser(1, "active");
        harness.seedUser(2, "inactive");
        harness.seedUser(3, "active");
      },
      run: (gateway) =>
        gateway.publishEvent({
          eventType: "ANNOUNCEMENT",
          title: "T",
          message: "M",
          audience: { mode: "ALL_ACTIVE_USERS" },
        }),
    });
  });

  it("publishEvent ALL_ACTIVE_USERS with no active users", async () => {
    await expectParity("publish ALL_ACTIVE_USERS empty", {
      seed: () => harness.seedUser(2, "inactive"),
      run: (gateway) =>
        gateway.publishEvent({
          eventType: "ANNOUNCEMENT",
          title: "T",
          message: "M",
          audience: { mode: "ALL_ACTIVE_USERS" },
        }),
    });
  });

  it("publishEvent stores title/message untrimmed", async () => {
    await expectParity("publish untrimmed", {
      run: (gateway) =>
        gateway.publishEvent({
          eventType: "E",
          title: "  spaced  ",
          message: "  msg  ",
          audience: { mode: "USER_IDS", userIds: [15] },
        }),
    });
  });

  it("listUserNotifications full list (order, mapping, raw data)", async () => {
    await expectParity("list full", {
      seed: () => {
        harness.seedNotification({ id: 1, userId: 7, createdAt: new Date(harness.BASE + 1000), data: '{"a":1}' });
        harness.seedNotification({
          id: 2,
          userId: 7,
          createdAt: new Date(harness.BASE + 2000),
          read: true,
          readAt: new Date(harness.BASE + 2500),
        });
        harness.seedNotification({ id: 3, userId: 7, createdAt: new Date(harness.BASE + 3000), data: "plain-string" });
        harness.seedNotification({ id: 4, userId: 8, createdAt: new Date(harness.BASE + 4000) });
      },
      run: async (gateway) => (await gateway.listUserNotifications(7)).map(harness.maskItem),
    });
  });

  it("listUserNotifications unreadOnly", async () => {
    await expectParity("list unreadOnly", {
      seed: () => {
        harness.seedNotification({ id: 1, userId: 7 });
        harness.seedNotification({ id: 2, userId: 7, read: true });
        harness.seedNotification({ id: 3, userId: 7 });
      },
      run: async (gateway) =>
        (await gateway.listUserNotifications(7, true)).map((item) => item.id),
    });
  });

  it("getUnreadCount", async () => {
    await expectParity("count unread", {
      seed: () => {
        harness.seedNotification({ id: 1, userId: 7 });
        harness.seedNotification({ id: 2, userId: 7, read: true });
        harness.seedNotification({ id: 3, userId: 8 });
      },
      run: async (gateway) => [
        await gateway.getUnreadCount(7),
        await gateway.getUnreadCount(8),
        await gateway.getUnreadCount(99),
      ],
    });
  });

  it("markAsRead own / already-read / other user / missing", async () => {
    await expectParity("markAsRead", {
      seed: () => {
        harness.seedNotification({ id: 1, userId: 7 });
        harness.seedNotification({ id: 2, userId: 7, read: true, readAt: new Date(harness.BASE + 500) });
        harness.seedNotification({ id: 3, userId: 8 });
      },
      run: async (gateway) => [
        await gateway.markAsRead(7, 1),
        await gateway.markAsRead(7, 2),
        await gateway.markAsRead(7, 3),
        await gateway.markAsRead(7, 999),
      ],
    });
  });

  it("markAllAsRead", async () => {
    await expectParity("markAllAsRead", {
      seed: () => {
        harness.seedNotification({ id: 1, userId: 7 });
        harness.seedNotification({ id: 2, userId: 7 });
        harness.seedNotification({ id: 3, userId: 7, read: true });
        harness.seedNotification({ id: 4, userId: 8 });
      },
      run: (gateway) => gateway.markAllAsRead(7),
    });
  });

  it("deleteUserNotification own / other user / missing", async () => {
    await expectParity("delete", {
      seed: () => {
        harness.seedNotification({ id: 1, userId: 7 });
        harness.seedNotification({ id: 2, userId: 8 });
      },
      run: async (gateway) => [
        await gateway.deleteUserNotification(7, 1),
        await gateway.deleteUserNotification(7, 2),
        await gateway.deleteUserNotification(7, 999),
      ],
    });
  });
});
