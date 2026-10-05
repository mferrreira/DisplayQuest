// @vitest-environment node
/**
 * V4-1 (DEC-55) — o contrato HTTP da recusa de exclusão.
 *
 * Por que um arquivo novo e não `users-routes.test.ts`: aquele dobra o módulo
 * (`userManagement: mocks.fakeModule`), então o `deleteUser` dele é uma função que devolve
 * `undefined` — a recusa não existe lá. Um duplo de módulo não decide nada (a lição medida do
 * B6-2a, que fez o 403 de badge SUMIR do teste em vez de falhar). Aqui o módulo é REAL sobre uma
 * porta falsa, e quem decide é o `DeleteUserUseCase` de produção.
 *
 * O que estava quebrado antes e este arquivo passa a fixar: a rota devolvia **500 com a mensagem
 * crua do Prisma** no corpo — `error.message || "Erro ao excluir usuário"` em
 * `app/api/users/[id]/route.ts:91`, e `domainErrorResponse` devolve `null` para não-DomainError.
 * O corpo incluía o bloco `Invalid prisma.users.delete() invocation` e o nome da constraint.
 * Agora é 409 com `{ error, code, details }` e uma frase que diz o que fazer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createUserManagementModule } from "@/backend/modules/user-management";
import type { UserRepositoryPort, UserRecord } from "@/backend/modules/user-management/application/ports/user.repository";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  /** quantas linhas de outros registros apontam para cada usuário */
  dependents: new Map<number, number>(),
  deleted: [] as number[],
}));

vi.mock("@/backend/composition/root", () => {
  const record = (id: number): UserRecord =>
    ({
      id,
      name: `Usuário ${id}`,
      email: `u${id}@x.com`,
      password: "bcrypt:x",
      status: "active",
      points: 10,
      completedTasks: 1,
      weekHours: 0,
      currentWeekHours: 0,
      roles: ["VOLUNTARIO"],
      avatar: null,
      bio: null,
      profileVisibility: "public",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }) as UserRecord;

  // Porta falsa: só o caminho do DELETE é exercitado. As demais respondem com erro alto, porque
  // um duplo que devolve `undefined` em silêncio transforma porta faltando em teste verde.
  const boom = (name: string) => async () => {
    throw new Error(`porta não deveria ser usada neste teste: ${name}`);
  };
  const repository: UserRepositoryPort = {
    findById: async (id) => (id === 4 || id === 5 ? record(id) : null),
    delete: async (id) => {
      mocks.deleted.push(id);
    },
    countBlockingDependencies: async (id) => mocks.dependents.get(id) ?? 0,
    findByEmail: boom("findByEmail"),
    create: boom("create"),
    update: boom("update"),
    findPending: boom("findPending"),
    findActiveUsers: boom("findActiveUsers"),
    findTopByPoints: boom("findTopByPoints"),
    findTopByTasks: boom("findTopByTasks"),
    findAll: boom("findAll"),
    findByProfileVisibility: boom("findByProfileVisibility"),
    getUsersByRole: boom("getUsersByRole"),
    getUsersByStatus: boom("getUsersByStatus"),
    getUserStatistics: boom("getUserStatistics"),
    isProjectMember: boom("isProjectMember"),
    leadsProject: boom("leadsProject"),
  };

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      userManagement: createUserManagementModule({ repository }),
    }),
  };
});

// Só a sessão é dobrada: `requireApiActor` e `hasPermission` seguem sendo os de produção.
vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { DELETE } from "@/app/api/users/[id]/route";

/** Array porque `requireApiActor` normaliza com `normalizeRoles` — string solta vira `[]`. */
const MANAGER = ["COORDENADOR"];
const NO_MANAGEMENT = ["VOLUNTARIO"];

function login(roles: string[], id = 42) {
  mocks.session = { id, email: "chef@lab.com", name: "Coordenador", roles, status: "active" };
}

function request(path: string, method = "DELETE") {
  return new NextRequest(new URL(path, "http://localhost:3000"), { method });
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const read = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.session = null;
  mocks.dependents = new Map([[4, 0], [5, 7]]);
  mocks.deleted = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DELETE /api/users/[id] — a recusa no lugar do erro do banco", () => {
  it("usuário com dependência: 409 com code, e NENHUMA tentativa de delete", async () => {
    login(MANAGER);
    const response = await DELETE(request("/api/users/5"), idContext("5"));
    expect(response.status).toBe(409);

    const body = await read(response);
    expect(body).toMatchObject({ code: "CONFLICT" });
    expect(body.error).toContain("Inative");
    // O corpo legado continha o bloco do Prisma. Nada de vocabulário de persistência aqui.
    for (const leak of ["prisma", "foreign key", "constraint", "p2003", "fkey"]) {
      expect(String(body.error).toLowerCase()).not.toContain(leak);
    }
    expect(mocks.deleted).toEqual([]);
  });

  it("usuário sem dependência continua 200 {success:true} — o caso que já funcionava", async () => {
    login(MANAGER);
    const response = await DELETE(request("/api/users/4"), idContext("4"));
    expect(response.status).toBe(200);
    expect(await read(response)).toEqual({ success: true });
    expect(mocks.deleted).toEqual([4]);
  });

  it("usuário inexistente continua 404 (a ordem não mudou: existência antes da dependência)", async () => {
    login(MANAGER);
    const response = await DELETE(request("/api/users/99"), idContext("99"));
    expect(response.status).toBe(404);
    expect(await read(response)).toMatchObject({ error: "Usuário não encontrado", code: "NOT_FOUND" });
    expect(mocks.deleted).toEqual([]);
  });

  it("sem MANAGE_USERS o 403 vem antes da recusa: um não-gestor não descobre quem tem histórico", async () => {
    login(NO_MANAGEMENT);
    const response = await DELETE(request("/api/users/5"), idContext("5"));
    expect(response.status).toBe(403);
    expect(mocks.deleted).toEqual([]);
  });

  it("id inválido continua 400 de rota, sem tocar no módulo", async () => {
    login(MANAGER);
    const response = await DELETE(request("/api/users/abc"), idContext("abc"));
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({ error: "Usuário inválido" });
    expect(mocks.deleted).toEqual([]);
  });
});
