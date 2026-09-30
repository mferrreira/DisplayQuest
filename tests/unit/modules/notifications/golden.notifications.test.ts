// @vitest-environment node
/**
 * OND1-B1 (R0) — golden/characterization matrix of the notifications module (clean-arch pilot).
 *
 * This file FREEZES the current behavior of `PrismaNotificationsGateway` and of the
 * `NotificationsModule` use-case layer BEFORE any refactor touches them (PLAN §3 R0,
 * SPEC §5 "golden tests registrados antes de mexer"). Every expectation below is the
 * observed output of HEAD 7949383 + ONDA 0, including the quirks:
 *
 *   - `listUserNotifications` returns the `data` column UNPARSED (raw string) — the gateway
 *     never calls its own `parseData` helper.
 *   - `publishEvent` stores `JSON.stringify(command.data)`; `undefined` -> null column,
 *     `null` -> the 4-char string "null", a string -> double-encoded JSON.
 *   - USER_IDS recipients are filtered (`Number.isInteger && > 0`) and deduplicated, keeping
 *     first-seen order; an empty result short-circuits BEFORE any createMany.
 *   - `markAsRead` matches on (id, userId) only — an already-read notification re-marks and
 *     still returns true.
 *   - Titles/messages are stored UNTRIMMED by the gateway (the use case only validates).
 *   - `triggeredByUserId` is accepted by the command and never persisted (no such column).
 *
 * Seam mocked: `@/lib/database/prisma` (repo pattern — mock the lib seam, never builtins).
 * Timestamps are masked to "<iso>" because the gateway stamps `new Date()` at mutation time;
 * everything else is compared exactly.
 *
 * The matrix must stay GREEN before (R0), during (R2) and after (R5) the refactor: the
 * outputs and the error MESSAGES are the frozen contract. Error TYPES may evolve to
 * backend/domain/errors (R4) — that is why the assertions match messages, not classes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  /** Fixed epoch so seeded createdAt values are deterministic across runs. */
  const BASE = Date.parse("2026-01-01T00:00:00.000Z");

  const state = {
    notifications: [] as Row[],
    users: [] as Array<{ id: number; status: string }>,
    idSeq: 0,
    tsSeq: 0,
    calls: [] as Array<{ method: string; args: any }>,
  };

  const nextTs = () => new Date(BASE + ++state.tsSeq * 1000);

  /** Equality match on the keys the gateway actually uses: userId, id, read, status. */
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
            read: false, // column default @default(false)
            createdAt: nextTs(), // column default @default(now())
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

  function rowById(id: number) {
    return state.notifications.find((row) => row.id === id);
  }

  return { BASE, state, prisma, reset, seedUser, seedNotification, rowById };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: harness.prisma }));

import { PrismaNotificationsGateway } from "@/backend/modules/notifications/infrastructure/prisma-notifications.gateway";
import { createNotificationsModule } from "@/backend/modules/notifications";

/** Mask volatile timestamps (the gateway stamps `new Date()` at mutation time). */
const TS = "<iso>";
function stampItem(item: { createdAt?: unknown; readAt?: unknown }) {
  const stamp = (value: unknown) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? TS : value ?? null;
  return { ...item, createdAt: stamp(item.createdAt), readAt: stamp(item.readAt) };
}

describe("golden — PrismaNotificationsGateway.publishEvent (USER_IDS)", () => {
  let gateway: PrismaNotificationsGateway;
  beforeEach(() => {
    harness.reset();
    gateway = new PrismaNotificationsGateway();
  });

  it("dedupes recipients, keeping first-seen order, and creates one row per recipient", async () => {
    const result = await gateway.publishEvent({
      eventType: "TASK_DONE",
      title: "Titulo",
      message: "Mensagem",
      audience: { mode: "USER_IDS", userIds: [2, 2, 3] },
    });

    expect(result).toEqual({ createdCount: 2, recipients: [2, 3] });
    expect(
      harness.state.notifications.map((row) => ({
        userId: row.userId,
        type: row.type,
        title: row.title,
        message: row.message,
        data: row.data,
        read: row.read,
      })),
    ).toEqual([
      { userId: 2, type: "TASK_DONE", title: "Titulo", message: "Mensagem", data: null, read: false },
      { userId: 3, type: "TASK_DONE", title: "Titulo", message: "Mensagem", data: null, read: false },
    ]);
  });

  it("filters non-integer and non-positive ids", async () => {
    const result = await gateway.publishEvent({
      eventType: "TASK_DONE",
      title: "T",
      message: "M",
      audience: { mode: "USER_IDS", userIds: [0, -1, 2.5, 4, 7] },
    });

    expect(result).toEqual({ createdCount: 2, recipients: [4, 7] });
  });

  it("empty recipient list short-circuits BEFORE any createMany", async () => {
    const result = await gateway.publishEvent({
      eventType: "TASK_DONE",
      title: "T",
      message: "M",
      audience: { mode: "USER_IDS", userIds: [] },
    });

    expect(result).toEqual({ createdCount: 0, recipients: [] });
    expect(harness.state.calls.map((call) => call.method)).not.toContain("notifications.createMany");
  });

  it("data envelope: undefined -> null column; object -> JSON string; string -> double-encoded; null -> \"null\"", async () => {
    await gateway.publishEvent({
      eventType: "E",
      title: "T",
      message: "M",
      data: undefined,
      audience: { mode: "USER_IDS", userIds: [11] },
    });
    await gateway.publishEvent({
      eventType: "E",
      title: "T",
      message: "M",
      data: { a: 1 },
      audience: { mode: "USER_IDS", userIds: [12] },
    });
    await gateway.publishEvent({
      eventType: "E",
      title: "T",
      message: "M",
      data: "raw",
      audience: { mode: "USER_IDS", userIds: [13] },
    });
    await gateway.publishEvent({
      eventType: "E",
      title: "T",
      message: "M",
      data: null,
      audience: { mode: "USER_IDS", userIds: [14] },
    });

    expect(harness.state.notifications.map((row) => row.data)).toEqual([
      null,
      '{"a":1}',
      '"raw"',
      "null",
    ]);
  });

  it("stores title/message UNTRIMMED (the gateway does not normalize)", async () => {
    await gateway.publishEvent({
      eventType: "E",
      title: "  spaced  ",
      message: "  msg  ",
      audience: { mode: "USER_IDS", userIds: [15] },
    });

    expect(harness.state.notifications[0].title).toBe("  spaced  ");
    expect(harness.state.notifications[0].message).toBe("  msg  ");
  });

  it("triggeredByUserId is accepted but never persisted (no such column)", async () => {
    await gateway.publishEvent({
      eventType: "E",
      title: "T",
      message: "M",
      triggeredByUserId: 99,
      audience: { mode: "USER_IDS", userIds: [16] },
    });

    expect(Object.keys(harness.state.notifications[0]).sort()).toEqual([
      "createdAt",
      "data",
      "id",
      "message",
      "read",
      "readAt",
      "title",
      "type",
      "userId",
    ]);
  });
});

describe("golden — PrismaNotificationsGateway.publishEvent (ALL_ACTIVE_USERS)", () => {
  let gateway: PrismaNotificationsGateway;
  beforeEach(() => {
    harness.reset();
    gateway = new PrismaNotificationsGateway();
  });

  it("resolves recipients to active users only, querying { status: \"active\" }", async () => {
    harness.seedUser(1, "active");
    harness.seedUser(2, "inactive");
    harness.seedUser(3, "active");

    const result = await gateway.publishEvent({
      eventType: "ANNOUNCEMENT",
      title: "T",
      message: "M",
      audience: { mode: "ALL_ACTIVE_USERS" },
    });

    expect(result).toEqual({ createdCount: 2, recipients: [1, 3] });
    const usersCall = harness.state.calls.find((call) => call.method === "users.findMany");
    expect(usersCall?.args.where).toEqual({ status: "active" });
  });

  it("no active users -> { createdCount: 0, recipients: [] } without createMany", async () => {
    harness.seedUser(2, "inactive");

    const result = await gateway.publishEvent({
      eventType: "ANNOUNCEMENT",
      title: "T",
      message: "M",
      audience: { mode: "ALL_ACTIVE_USERS" },
    });

    expect(result).toEqual({ createdCount: 0, recipients: [] });
    expect(harness.state.calls.map((call) => call.method)).not.toContain("notifications.createMany");
  });
});

describe("golden — PrismaNotificationsGateway.listUserNotifications", () => {
  let gateway: PrismaNotificationsGateway;
  beforeEach(() => {
    harness.reset();
    gateway = new PrismaNotificationsGateway();

    // user 7: n1 (oldest, unread, JSON-string data), n2 (read, readAt set), n3 (newest, unread, raw string)
    harness.seedNotification({ id: 1, userId: 7, createdAt: new Date(harness.BASE + 1000), data: '{"a":1}' });
    harness.seedNotification({
      id: 2,
      userId: 7,
      createdAt: new Date(harness.BASE + 2000),
      read: true,
      readAt: new Date(harness.BASE + 2500),
    });
    harness.seedNotification({ id: 3, userId: 7, createdAt: new Date(harness.BASE + 3000), data: "plain-string" });
    // user 8 owns n4 — must never leak into user 7's list
    harness.seedNotification({ id: 4, userId: 8, createdAt: new Date(harness.BASE + 4000) });
  });

  it("maps rows to NotificationItem: createdAt desc, data UNPARSED (raw string), ISO timestamps", async () => {
    const items = await gateway.listUserNotifications(7);

    expect(items.map(stampItem)).toEqual([
      {
        id: 3,
        userId: 7,
        type: "TEST_EVENT",
        title: "seed title",
        message: "seed message",
        data: "plain-string",
        read: false,
        createdAt: TS,
        readAt: null,
      },
      {
        id: 2,
        userId: 7,
        type: "TEST_EVENT",
        title: "seed title",
        message: "seed message",
        data: null,
        read: true,
        createdAt: TS,
        readAt: TS,
      },
      {
        id: 1,
        userId: 7,
        type: "TEST_EVENT",
        title: "seed title",
        message: "seed message",
        data: '{"a":1}',
        read: false,
        createdAt: TS,
        readAt: null,
      },
    ]);
  });

  it("unreadOnly=true filters read:false only", async () => {
    const items = await gateway.listUserNotifications(7, true);
    expect(items.map((item) => item.id)).toEqual([3, 1]);
  });

  it("never returns another user's rows", async () => {
    const items = await gateway.listUserNotifications(8);
    expect(items.map((item) => item.id)).toEqual([4]);
  });
});

describe("golden — PrismaNotificationsGateway counters and mutations", () => {
  let gateway: PrismaNotificationsGateway;
  beforeEach(() => {
    harness.reset();
    gateway = new PrismaNotificationsGateway();
  });

  it("getUnreadCount counts read:false rows of that user only", async () => {
    harness.seedNotification({ id: 1, userId: 7 });
    harness.seedNotification({ id: 2, userId: 7, read: true });
    harness.seedNotification({ id: 3, userId: 7 });
    harness.seedNotification({ id: 4, userId: 8 });

    expect(await gateway.getUnreadCount(7)).toBe(2);
    expect(await gateway.getUnreadCount(8)).toBe(1);
    expect(await gateway.getUnreadCount(99)).toBe(0);
  });

  it("markAsRead: own row -> true (read+readAt set); already-read own row -> true again; other user's row -> false; missing -> false", async () => {
    harness.seedNotification({ id: 1, userId: 7 });
    harness.seedNotification({ id: 2, userId: 7, read: true, readAt: new Date(harness.BASE + 500) });
    harness.seedNotification({ id: 3, userId: 8 });

    expect(await gateway.markAsRead(7, 1)).toBe(true);
    const n1 = harness.rowById(1);
    expect(n1?.read).toBe(true);
    expect(n1?.readAt).toBeInstanceOf(Date);

    expect(await gateway.markAsRead(7, 2)).toBe(true); // matches on (id, userId) only

    expect(await gateway.markAsRead(7, 3)).toBe(false); // belongs to user 8
    expect(harness.rowById(3)?.read).toBe(false);

    expect(await gateway.markAsRead(7, 999)).toBe(false);
  });

  it("markAllAsRead returns the count of the user's unread rows and leaves other users untouched", async () => {
    harness.seedNotification({ id: 1, userId: 7 });
    harness.seedNotification({ id: 2, userId: 7 });
    harness.seedNotification({ id: 3, userId: 7, read: true });
    harness.seedNotification({ id: 4, userId: 8 });

    expect(await gateway.markAllAsRead(7)).toBe(2);
    expect(harness.rowById(4)?.read).toBe(false);
    expect(harness.rowById(1)?.read).toBe(true);
    expect(harness.rowById(2)?.read).toBe(true);
  });

  it("deleteUserNotification: own -> true and row gone; other user's -> false and row kept; missing -> false", async () => {
    harness.seedNotification({ id: 1, userId: 7 });
    harness.seedNotification({ id: 2, userId: 8 });

    expect(await gateway.deleteUserNotification(7, 1)).toBe(true);
    expect(harness.rowById(1)).toBeUndefined();

    expect(await gateway.deleteUserNotification(7, 2)).toBe(false);
    expect(harness.rowById(2)).toBeDefined();

    expect(await gateway.deleteUserNotification(7, 999)).toBe(false);
  });
});

describe("golden — NotificationsModule use-case layer (what the routes consume)", () => {
  let gateway: PrismaNotificationsGateway;
  let notificationsModule: ReturnType<typeof createNotificationsModule>;
  beforeEach(() => {
    harness.reset();
    gateway = new PrismaNotificationsGateway();
    notificationsModule = createNotificationsModule({ gateway });
  });

  it("publishEvent validation: empty title -> \"Título é obrigatório\" (no gateway call)", async () => {
    await expect(
      notificationsModule.publishEvent({
        eventType: "E",
        title: "",
        message: "M",
        audience: { mode: "USER_IDS", userIds: [1] },
      }),
    ).rejects.toThrow("Título é obrigatório");
    expect(harness.state.calls).toHaveLength(0);
  });

  it("publishEvent validation: whitespace-only title -> same message", async () => {
    await expect(
      notificationsModule.publishEvent({
        eventType: "E",
        title: "   ",
        message: "M",
        audience: { mode: "USER_IDS", userIds: [1] },
      }),
    ).rejects.toThrow("Título é obrigatório");
  });

  it("publishEvent validation: empty message -> \"Mensagem é obrigatória\"", async () => {
    await expect(
      notificationsModule.publishEvent({
        eventType: "E",
        title: "T",
        message: " ",
        audience: { mode: "USER_IDS", userIds: [1] },
      }),
    ).rejects.toThrow("Mensagem é obrigatória");
  });

  it("publishEvent validation: USER_IDS with empty list -> \"Nenhum destinatário informado\"", async () => {
    await expect(
      notificationsModule.publishEvent({
        eventType: "E",
        title: "T",
        message: "M",
        audience: { mode: "USER_IDS", userIds: [] },
      }),
    ).rejects.toThrow("Nenhum destinatário informado");
    expect(harness.state.calls).toHaveLength(0);
  });

  it("publishEvent validation: ALL_ACTIVE_USERS is NOT subject to the empty-recipient rule", async () => {
    const result = await notificationsModule.publishEvent({
      eventType: "E",
      title: "T",
      message: "M",
      audience: { mode: "ALL_ACTIVE_USERS" },
    });
    expect(result).toEqual({ createdCount: 0, recipients: [] });
  });

  it("pass-through parity: every other module method returns exactly what the gateway returns", async () => {
    harness.seedNotification({ id: 1, userId: 7 });
    harness.seedNotification({ id: 2, userId: 7, read: true });
    harness.seedNotification({ id: 3, userId: 8 });

    expect(await notificationsModule.listUserNotifications(7)).toEqual(await gateway.listUserNotifications(7));
    expect(await notificationsModule.listUserNotifications(7, true)).toEqual(
      await gateway.listUserNotifications(7, true),
    );
    expect(await notificationsModule.getUnreadCount(7)).toBe(await gateway.getUnreadCount(7));
    expect(await notificationsModule.markAsRead(7, 1)).toBe(true);
    expect(await notificationsModule.markAsRead(7, 3)).toBe(false);
    expect(await notificationsModule.markAllAsRead(7)).toBe(0); // 1 was just marked by the line above
    expect(await notificationsModule.deleteUserNotification(7, 2)).toBe(true);
    expect(await notificationsModule.deleteUserNotification(7, 3)).toBe(false);
  });
});
