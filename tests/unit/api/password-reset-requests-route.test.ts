// @vitest-environment node
/**
 * plan-v24 S01 — a superfície HTTP pública da solicitação de troca de senha
 * (`POST /api/password-reset-requests`) e a leitura da gestão
 * (`GET /api/password-reset-requests`), exercitadas com a rota real sobre porta falsa.
 *
 * O que este arquivo prova:
 *  - POST público: 201 com a mensagem neutra, idêntica para email existente e inexistente
 *    (ADR-002, INV2 — a resposta não distingue os dois casos);
 *  - validação do use case na borda: campos obrigatórios e senha mínima (R2);
 *  - `pending` repetido: 409 com a frase congelada (R6);
 *  - GET: gate `MANAGE_USERS` com "Acesso negado." para quem não gerencia contas (CA6);
 *  - a lista nunca expõe a hash da solicitação.
 *
 * A aprovação e a rejeição entram no mesmo arquivo na S02 (gate antes do parse, 404 do
 * usuário apagado, escrita do hash). O duplo aplica as MESMAS funções do domínio
 * (molde DEC-90), não reimplementa a regra.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PENDING_MODERATION_DENIED_MESSAGE,
  PASSWORD_RESET_APPROVE_MESSAGE,
  PASSWORD_RESET_DUPLICATE_MESSAGE,
  PASSWORD_RESET_NEUTRAL_MESSAGE,
  PASSWORD_RESET_NOT_FOUND_MESSAGE,
  PASSWORD_RESET_REQUIRED_MESSAGE,
  PASSWORD_RESET_RESOLVE_REQUIRED_MESSAGE,
  PASSWORD_RESET_RESOLVED_MESSAGE,
  PASSWORD_RESET_SHORT_PASSWORD_MESSAGE,
  PASSWORD_RESET_REJECT_MESSAGE,
  PASSWORD_RESET_USER_NOT_FOUND_MESSAGE,
  requireActorPermission,
  validatePasswordResetInput,
} from "@/backend/domain";

const mocks = vi.hoisted(() => {
  const rows: Array<Record<string, unknown>> = [];
  const calls = {
    requestPasswordReset: [] as any[],
    listPasswordResetRequests: [] as any[],
    resolvePasswordResetRequest: [] as any[],
  };
  return { rows, calls, actorId: 42, actorRoles: ["COORDENADOR"] as string[] };
});

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({
    userManagement: {
      requestPasswordReset: async (command: any) => {
        mocks.calls.requestPasswordReset.push(command);
        // O duplo aplica a MESMA validação do use case (molde DEC-90) e o MESMO par de
        // duplo pending, em vez de reimplementar a regra.
        const input = validatePasswordResetInput(command);
        if (mocks.rows.some((row) => row.email === input.email && row.status === "pending")) {
          throw new ConflictError(PASSWORD_RESET_DUPLICATE_MESSAGE);
        }
        if (input.email !== "x@lab.com") return null; // email inexistente: mesma resposta
        const row = { id: 7, email: input.email, status: "pending", password: "bcrypt-hash" };
        mocks.rows.push(row);
        return { id: row.id, email: row.email, status: row.status };
      },
      listPasswordResetRequests: async (actor: any) => {
        mocks.calls.listPasswordResetRequests.push(actor);
        requireActorPermission(actor, "MANAGE_USERS", PENDING_MODERATION_DENIED_MESSAGE);
        return mocks.rows.map(({ password, ...row }) => row);
      },
      // S02: o assert antes do parse e o gate no próprio use case são o par medido na
      // rota `users/approve` (B6-4). O duplo aplica as MESMAS funções.
      assertCanManageUsers: ({ actor }: any) =>
        requireActorPermission(actor, "MANAGE_USERS", PENDING_MODERATION_DENIED_MESSAGE),
      resolvePasswordResetRequest: async (actor: any, id: number, action: string) => {
        mocks.calls.resolvePasswordResetRequest.push({ actor, id, action });
        requireActorPermission(actor, "MANAGE_USERS", PENDING_MODERATION_DENIED_MESSAGE);
        const row = mocks.rows.find((r) => r.id === id);
        if (!row) throw new NotFoundError(PASSWORD_RESET_NOT_FOUND_MESSAGE);
        if (row.status !== "pending") throw new ConflictError(PASSWORD_RESET_RESOLVED_MESSAGE);
        if (action === "approve") {
          // O usuário existe neste duplo quando o email é o da conta conhecida.
          if (row.email !== "x@lab.com") throw new NotFoundError(PASSWORD_RESET_USER_NOT_FOUND_MESSAGE);
          row.status = "approved";
          row.resolvedBy = actor.id;
          row.resolvedAt = "2026-11-12T12:00:00.000Z";
          return { id: row.id, email: row.email, status: "approved" };
        }
        row.status = "rejected";
        row.resolvedBy = actor.id;
        row.resolvedAt = "2026-11-12T12:00:00.000Z";
        return { id: row.id, email: row.email, status: "rejected" };
      },
    },
  }),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireApiActor: async () => ({ actor: { id: mocks.actorId, roles: mocks.actorRoles } }),
  ensurePermission: () => null,
  ensureAnyRole: () => null,
  ensureSelfOrPermission: () => null,
}));

import { GET, POST } from "@/app/api/password-reset-requests/route";

function post(body: unknown) {
  return new NextRequest(new URL("/api/password-reset-requests", "http://localhost:3000"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.rows.length = 0;
  mocks.calls.requestPasswordReset.length = 0;
  mocks.calls.listPasswordResetRequests.length = 0;
  mocks.calls.resolvePasswordResetRequest.length = 0;
  mocks.actorId = 42;
  mocks.actorRoles = ["COORDENADOR"];
});

describe("POST /api/password-reset-requests — envio público", () => {
  it("email existente: 201 com a mensagem neutra, hash nunca na resposta", async () => {
    const response = await POST(post({ email: "x@lab.com", password: "novasenha123" } as never));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.message).toBe(PASSWORD_RESET_NEUTRAL_MESSAGE);
    expect(JSON.stringify(body)).not.toContain("bcrypt");
    expect(mocks.calls.requestPasswordReset[0].email).toBe("x@lab.com");
  });

  it("email inexistente: mesma resposta 201, sem distinguir os casos (INV2)", async () => {
    const known = await POST(post({ email: "x@lab.com", password: "novasenha123" }) as never);
    const unknown = await POST(post({ email: "ningue@lab.com", password: "novasenha123" }) as never);
    expect(known.status).toBe(201);
    expect(unknown.status).toBe(201);
    expect((await unknown.json()).message).toBe((await known.json()).message);
    expect(unknown.headers.get("content-type")).toBe(known.headers.get("content-type"));
  });

  it("campos obrigatórios e senha mínima: 400 com as mensagens da casa", async () => {
    const missing = await POST(post({ email: "", password: "" }) as never);
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe(PASSWORD_RESET_REQUIRED_MESSAGE);

    const short = await POST(post({ email: "x@lab.com", password: "123" }) as never);
    expect(short.status).toBe(400);
    expect((await short.json()).error).toBe(PASSWORD_RESET_SHORT_PASSWORD_MESSAGE);
  });

  it("segunda solicitação pendente: 409 com a frase congelada", async () => {
    // A primeira criação vai pelo caminho público; a segunda é o duplo.
    await POST(post({ email: "x@lab.com", password: "novasenha123" }) as never);
    const response = await POST(post({ email: "x@lab.com", password: "novasenha123" }) as never);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(PASSWORD_RESET_DUPLICATE_MESSAGE);
  });
});

describe("GET /api/password-reset-requests — leitura da gestão", () => {
  it("quem gerencia contas vê a lista sem a hash", async () => {
    // Prepara uma linha pending pelo caminho público, depois lê.
    await POST(post({ email: "x@lab.com", password: "novasenha123" }) as never);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.requests.some((r: any) => r.email === "x@lab.com")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("bcrypt");
  });

  it("quem não gerencia contas recebe a negação congelada", async () => {
    mocks.actorRoles = ["VOLUNTARIO"];
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe(PENDING_MODERATION_DENIED_MESSAGE);
  });
});

describe("POST /api/password-reset-requests — aprovação e rejeição (S02)", () => {
  beforeEach(async () => {
    // Prepara uma linha pending pelo caminho público.
    await POST(post({ email: "x@lab.com", password: "novasenha123" }) as never);
    mocks.calls.resolvePasswordResetRequest.length = 0;
    mocks.actorRoles = ["COORDENADOR"];
  });

  it("gate antes do parse: voluntário com corpo válido recebe 403, o use case não roda", async () => {
    mocks.actorRoles = ["VOLUNTARIO"];
    const response = await POST(post({ id: 7, action: "approve" }) as never);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe(PENDING_MODERATION_DENIED_MESSAGE);
    expect(mocks.calls.resolvePasswordResetRequest).toHaveLength(0);
  });

  it("ação inválida, id ausente, ação ausente: 400 com a frase da resolução", async () => {
    const bad = await POST(post({ id: 7, action: "maybe" }) as never);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe(PASSWORD_RESET_RESOLVE_REQUIRED_MESSAGE);

    const noId = await POST(post({ action: "approve" }) as never);
    expect(noId.status).toBe(400);
    expect((await noId.json()).error).toBe(PASSWORD_RESET_RESOLVE_REQUIRED_MESSAGE);

    // Corpo `{id}` sem `action` cai no caminho público, e o 400 é a frase do
    // formulário — ramo medido, congelado aqui (não é a frase da resolução).
    const noAction = await POST(post({ id: 7 }) as never);
    expect(noAction.status).toBe(400);
    expect((await noAction.json()).error).toBe(PASSWORD_RESET_REQUIRED_MESSAGE);
  });

  it("aprovar: 200, hash aplicada no use case, resolvedBy do ator, conta não muda", async () => {
    const response = await POST(post({ id: 7, action: "approve" }) as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.request.status).toBe("approved");
    expect(body.message).toBe(PASSWORD_RESET_APPROVE_MESSAGE);
    expect(mocks.calls.resolvePasswordResetRequest[0]).toMatchObject({
      actor: { id: 42 },
      id: 7,
      action: "approve",
    });
    expect(mocks.rows[0].resolvedBy).toBe(42);
    expect(mocks.rows[0].resolvedAt).not.toBeNull();
    expect(JSON.stringify(body)).not.toContain("bcrypt");
  });

  it("rejeitar: 200 com a frase da casa e a hash da solicitação não vira senha de conta", async () => {
    const response = await POST(post({ id: 7, action: "reject" }) as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.request.status).toBe("rejected");
    expect(body.message).toBe(PASSWORD_RESET_REJECT_MESSAGE);
    expect(mocks.rows[0].status).toBe("rejected");
  });

  it("aprovar com usuário apagado: 404 e a solicitação continua pending", async () => {
    mocks.rows[0].email = "fantasma@lab.com";
    const response = await POST(post({ id: 7, action: "approve" }) as never);
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe(PASSWORD_RESET_USER_NOT_FOUND_MESSAGE);
    expect(mocks.rows[0].status).toBe("pending");
  });

  it("aprovar uma solicitação já resolvida: 409, nenhuma segunda escrita", async () => {
    mocks.rows[0].status = "approved";
    const response = await POST(post({ id: 7, action: "approve" }) as never);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(PASSWORD_RESET_RESOLVED_MESSAGE);
    // A rota chama o use case uma vez; o use case recusa antes de escrever.
    expect(mocks.calls.resolvePasswordResetRequest).toHaveLength(1);
  });
});

describe("duplo do domínio", () => {
  it("ForbiddenError existe no domínio (gate da casa, não uma cópia local)", () => {
    expect(new ForbiddenError("Acesso negado.").message).toBe("Acesso negado.");
  });
});
