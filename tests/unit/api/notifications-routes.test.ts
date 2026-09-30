// @vitest-environment node
/**
 * OND1-B3 (R4) — rota tests of app/api/notifications/* (PLAN §5 batch 1.3).
 *
 * Mocked seams: `@/backend/composition/root` (fake NotificationsModule) and
 * `@/lib/auth/api-guard` (fake actor/permission). The routes themselves are NOT mocked —
 * these tests pin the HTTP contract: stable status for typed business conditions
 * (400/403/404/409 via DomainError mapping — AC-00-07), and the pre-existing
 * route-level validations unchanged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain";

const mocks = vi.hoisted(() => {
  const fakeModule = {
    publishEvent: async (command: any) => ({
      createdCount: 1,
      recipients: command.audience?.mode === "USER_IDS" ? command.audience.userIds : [1],
    }),
    listUserNotifications: async (userId: number) => [
      {
        id: 1,
        userId,
        type: "TASK_DONE",
        title: "t",
        message: "m",
        data: null,
        read: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        readAt: null,
      },
    ],
    getUnreadCount: async () => 2,
    markAsRead: async () => true,
    markAllAsRead: async () => 3,
    deleteUserNotification: async () => true,
  };
  const auth = {
    actor: { id: 42, roles: ["ADMIN"] },
    permissionError: null as unknown | null,
  };
  return { fakeModule, auth };
});

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({ notifications: mocks.fakeModule }),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireApiActor: async () => ({ actor: mocks.auth.actor }),
  ensurePermission: () => mocks.auth.permissionError,
}));

import { GET, POST } from "@/app/api/notifications/route";
import { DELETE, PUT } from "@/app/api/notifications/[id]/route";
import { POST as markAllRead } from "@/app/api/notifications/mark-all-read/route";

function makeRequest(path: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mocks.auth.permissionError = null;
  mocks.fakeModule.publishEvent = async (command: any) => ({
    createdCount: 1,
    recipients: command.audience?.mode === "USER_IDS" ? command.audience.userIds : [1],
  });
  mocks.fakeModule.markAsRead = async () => true;
  mocks.fakeModule.deleteUserNotification = async () => true;
  mocks.fakeModule.markAllAsRead = async () => 3;
});

describe("GET /api/notifications", () => {
  it("200 with the notifications list", async () => {
    const response = await GET(makeRequest("/api/notifications"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].id).toBe(1);
  });

  it("?count=true returns only the unread count", async () => {
    const response = await GET(makeRequest("/api/notifications?count=true"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, count: 2 });
  });

  it("typed NotFoundError maps to 404 (never a generic 500)", async () => {
    mocks.fakeModule.listUserNotifications = async () => {
      throw new NotFoundError("Notificações indisponíveis");
    };
    const response = await GET(makeRequest("/api/notifications"));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Notificações indisponíveis");
    expect(body.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/notifications", () => {
  it("201 on the happy path", async () => {
    const response = await POST(
      makeRequest("/api/notifications", {
        method: "POST",
        body: { title: "Aviso", message: "Corpo", userId: 5 },
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.createdCount).toBe(1);
  });

  it("400 when title/message missing (route-level validation preserved)", async () => {
    const response = await POST(
      makeRequest("/api/notifications", { method: "POST", body: { title: "", message: "" } }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Título e mensagem são obrigatórios");
  });

  it("400 when no recipient informed", async () => {
    const response = await POST(
      makeRequest("/api/notifications", {
        method: "POST",
        body: { title: "Aviso", message: "Corpo", userIds: [] },
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Informe ao menos um destinatário");
  });

  it("403 when MANAGE_NOTIFICATIONS is missing", async () => {
    const { NextResponse } = await import("next/server");
    mocks.auth.permissionError = NextResponse.json(
      { error: "Sem permissão para criar notificações" },
      { status: 403 },
    );
    const response = await POST(
      makeRequest("/api/notifications", {
        method: "POST",
        body: { title: "Aviso", message: "Corpo", userId: 5 },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("use-case ValidationError maps to 400 (was 500 before R4)", async () => {
    mocks.fakeModule.publishEvent = async () => {
      throw new ValidationError("Nenhum destinatário informado");
    };
    const response = await POST(
      makeRequest("/api/notifications", {
        method: "POST",
        body: { title: "Aviso", message: "Corpo", sendToAll: false, userId: 5 },
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Nenhum destinatário informado");
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});

describe("PUT/DELETE /api/notifications/[id]", () => {
  it("PUT 400 on invalid id", async () => {
    const response = await PUT(makeRequest("/api/notifications/abc", { method: "PUT", body: { action: "markAsRead" } }), idContext("abc"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("ID de notificação inválido");
  });

  it("PUT 400 on unsupported action", async () => {
    const response = await PUT(makeRequest("/api/notifications/12", { method: "PUT", body: { action: "delete" } }), idContext("12"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Ação não suportada");
  });

  it("PUT 404 when the row is not found for this actor", async () => {
    mocks.fakeModule.markAsRead = async () => false;
    const response = await PUT(makeRequest("/api/notifications/12", { method: "PUT", body: { action: "markAsRead" } }), idContext("12"));
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Notificação não encontrada");
  });

  it("PUT 200 on the happy path", async () => {
    const response = await PUT(makeRequest("/api/notifications/12", { method: "PUT", body: { action: "markAsRead" } }), idContext("12"));
    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
  });

  it("PUT maps a typed ForbiddenError to 403", async () => {
    mocks.fakeModule.markAsRead = async () => {
      throw new ForbiddenError("Acesso negado");
    };
    const response = await PUT(makeRequest("/api/notifications/12", { method: "PUT", body: { action: "markAsRead" } }), idContext("12"));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("FORBIDDEN");
  });

  it("DELETE 200 when removed, 404 when not found", async () => {
    const ok = await DELETE(makeRequest("/api/notifications/12", { method: "DELETE" }), idContext("12"));
    expect(ok.status).toBe(200);

    mocks.fakeModule.deleteUserNotification = async () => false;
    const missing = await DELETE(makeRequest("/api/notifications/12", { method: "DELETE" }), idContext("12"));
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe("Notificação não encontrada");
  });
});

describe("POST /api/notifications/mark-all-read", () => {
  it("200 with the updated count", async () => {
    const response = await markAllRead();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.updatedCount).toBe(3);
  });

  it("typed ConflictError maps to 409", async () => {
    mocks.fakeModule.markAllAsRead = async () => {
      throw new ConflictError("Estado conflitante");
    };
    const response = await markAllRead();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("CONFLICT");
  });
});
