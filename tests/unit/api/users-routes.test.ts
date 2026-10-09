// @vitest-environment node
/**
 * OND2-B3 (R4) — rota tests of app/api/users/* and app/api/auth/register.
 *
 * Mocked seams: `@/backend/composition/root` (fake UserManagementModule) and
 * `@/lib/auth/api-guard`. The routes themselves are NOT mocked — these tests pin the HTTP
 * contract (AC-00-07): stable status for typed business conditions via domainErrorResponse,
 * route-level validations unchanged, and the frozen payload shapes.
 *
 * Intentional status evolutions (documented in STATE 2.3):
 *   - POST /api/users duplicate email: 400 -> 409 (ConflictError).
 *   - deduct-hours insufficient/negative hours: 500 (message hidden) -> 400 with the message.
 *   - approve missing user: 500 (P2025 branch only) -> 404 "Usuário não encontrado" (mapped).
 *   - register duplicate email: 400 -> 409.
 * Avatar upload routes (fs/ImageProcessor seams) are exercised by the G4 roundtrip instead.
 *
 * B6-4 (D4): os gates das 8 rotas desceram para os use cases. Este arquivo continua o contrato
 * HTTP+MAPPER (mantem o duplo de módulo), e o duplo passou a DELEGAR nas MESMAS funções do
 * domínio que os use cases chamam (padrão DEC-90, o mesmo do reporting-routes): a negação vem
 * dos PAPEIS do ator (`login([...])`), não do mock de `ensurePermission`/`ensureSelfOrPermission`
 * — que saiu (nenhuma rota deste arquivo importa guard de permissão ha; se voltar, falha alto).
 * O fallback legado de 403 do GET (match por mensagem "não tem permissão") foi REMOVIDO da rota:
 * era código morto — ForbiddenError já era mapeado por domainErrorResponse antes mesmo do lote.
 * Autorização com o MÓDULO REAL: users-authorization.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ConflictError,
  CREATE_USER_DENIED_MESSAGE,
  ForbiddenError,
  NotFoundError,
  PENDING_MODERATION_DENIED_MESSAGE,
  PROFILE_DENIED_MESSAGE,
  resolveUserListVisibility,
  requireActorPermission,
  requireActorSelfOrPermission,
  ValidationError,
  type ActorRef,
} from "@/backend/domain";

const mocks = vi.hoisted(() => {
  const fakeModule = {
    // B6-4 (D4): os métodos migrados DELEGAM nas funções do domínio que os use cases chamam
    // (padrão DEC-90). O duplo fornece os dados; a decisão é a matriz real via papéis do ator.
    listUsersForActor: async (query: { actor: ActorRef }) => {
      const visibility = resolveUserListVisibility(
        query.actor.kind === "user" ? (query.actor.roles as readonly string[]) : [],
      );
      if (!visibility.canViewBasicUsers) {
        throw new ForbiddenError("Usuário não tem permissão para visualizar outros usuários");
      }
      return [{ id: 1, name: "Ana" }];
    },
    assertCanManageUsers: (command: { actor: ActorRef; deniedMessage?: string }) => {
      requireActorPermission(command.actor, "MANAGE_USERS", command.deniedMessage);
    },
    createUser: async (command: { actor: ActorRef; name?: string; email?: string }) => {
      requireActorPermission(command.actor, "MANAGE_USERS", CREATE_USER_DENIED_MESSAGE);
      return { id: 10, name: command.name, email: command.email, status: "active" };
    },
    registerUser: async (command: any) => ({
      id: 11,
      name: command.name,
      email: String(command.email).toLowerCase(),
      status: "pending",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
    findUserById: async (actor: ActorRef, id: number, deniedMessage?: string) => {
      requireActorSelfOrPermission(actor, id, "MANAGE_USERS", deniedMessage);
      return { id, name: "Ana", email: "ana@x.com" };
    },
    updateUser: async (actor: ActorRef, id: number) => {
      requireActorSelfOrPermission(actor, id, "MANAGE_USERS");
      return { id, name: "Ana" };
    },
    deleteUser: async (actor: ActorRef) => {
      requireActorPermission(actor, "MANAGE_USERS");
    },
    listPendingUsers: async (actor: ActorRef) => {
      requireActorPermission(actor, "MANAGE_USERS", PENDING_MODERATION_DENIED_MESSAGE);
      return [{ id: 4, name: "Pendente" }];
    },
    moderatePendingUser: async (actor: ActorRef, id: number, action: string) => {
      requireActorPermission(actor, "MANAGE_USERS", PENDING_MODERATION_DENIED_MESSAGE);
      return action === "approve" ? { id, status: "active" } : undefined;
    },
    updateUserProfile: async (actor: ActorRef, id: number) => {
      requireActorSelfOrPermission(actor, id, "MANAGE_USERS", PROFILE_DENIED_MESSAGE);
      return { id, name: "Ana" };
    },
    updateUserPoints: async (command: { actor: ActorRef; userId: number }) => {
      requireActorPermission(command.actor, "MANAGE_USERS");
      return { id: command.userId, points: 15 };
    },
    deductUserHours: async () => ({ message: "5 horas retiradas com sucesso", user: { id: 1 } }),
    updateUserRoles: async (command: { actor: ActorRef; userId: number }) => {
      requireActorPermission(command.actor, "MANAGE_USERS");
      return { id: command.userId, roles: ["VOLUNTARIO"] };
    },
    updateUserStatus: async (command: { actor: ActorRef; userId: number }) => {
      requireActorPermission(command.actor, "MANAGE_USERS");
      return { id: command.userId, status: "suspended" };
    },
  };
  const auth = {
    actor: { id: 42, roles: ["COORDENADOR"] },
  };
  return { fakeModule, auth };
});

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({ userManagement: mocks.fakeModule }),
}));

// B6-4: so `requireApiActor` e dobrado. `ensurePermission`/`ensureSelfOrPermission` sairam —
// nenhuma rota deste arquivo importa guard de permissao ha; a decisao e a matriz real via
// delegacao do duplo. Se uma rota voltar a importar rbac/guard, o teste falha alto.
vi.mock("@/lib/auth/api-guard", () => ({
  requireApiActor: async () => ({ actor: mocks.auth.actor }),
}));

import { GET as usersList, POST as usersCreate } from "@/app/api/users/route";
import { DELETE as userDelete, GET as userGet, PUT as userPut } from "@/app/api/users/[id]/route";
import { PATCH as userRoles } from "@/app/api/users/[id]/roles/route";
import { PATCH as userStatus } from "@/app/api/users/[id]/status/route";
import { PATCH as userPoints } from "@/app/api/users/[id]/points/route";
import { POST as deductHours } from "@/app/api/users/[id]/deduct-hours/route";
import { GET as profileGet, PATCH as profilePatch } from "@/app/api/users/[id]/profile/route";
import { GET as approveList, POST as approveModerate } from "@/app/api/users/approve/route";
import { POST as register } from "@/app/api/auth/register/route";

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

function login(roles: string[], id = 42) {
  mocks.auth.actor = { id, roles };
}

beforeEach(() => {
  login(["COORDENADOR"]);
  mocks.fakeModule.listUsersForActor = async (query: { actor: ActorRef }) => {
    const visibility = resolveUserListVisibility(
      query.actor.kind === "user" ? (query.actor.roles as readonly string[]) : [],
    );
    if (!visibility.canViewBasicUsers) {
      throw new ForbiddenError("Usuário não tem permissão para visualizar outros usuários");
    }
    return [{ id: 1, name: "Ana" }];
  };
  mocks.fakeModule.createUser = async (command: { actor: ActorRef; name?: string; email?: string }) => {
    requireActorPermission(command.actor, "MANAGE_USERS", CREATE_USER_DENIED_MESSAGE);
    return { id: 10, name: command.name, email: command.email, status: "active" };
  };
  mocks.fakeModule.registerUser = async (command: any) => ({
    id: 11,
    name: command.name,
    email: String(command.email).toLowerCase(),
    status: "pending",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  mocks.fakeModule.findUserById = async (actor: ActorRef, id: number, deniedMessage?: string) => {
    requireActorSelfOrPermission(actor, id, "MANAGE_USERS", deniedMessage);
    return { id, name: "Ana", email: "ana@x.com" };
  };
  mocks.fakeModule.updateUser = async (actor: ActorRef, id: number) => {
    requireActorSelfOrPermission(actor, id, "MANAGE_USERS");
    return { id, name: "Ana" };
  };
  mocks.fakeModule.deleteUser = async (actor: ActorRef) => {
    requireActorPermission(actor, "MANAGE_USERS");
  };
  mocks.fakeModule.moderatePendingUser = async (actor: ActorRef, id: number, action: string) => {
    requireActorPermission(actor, "MANAGE_USERS", PENDING_MODERATION_DENIED_MESSAGE);
    return action === "approve" ? { id, status: "active" } : undefined;
  };
  mocks.fakeModule.updateUserProfile = async (actor: ActorRef, id: number) => {
    requireActorSelfOrPermission(actor, id, "MANAGE_USERS", PROFILE_DENIED_MESSAGE);
    return { id, name: "Ana" };
  };
  mocks.fakeModule.updateUserPoints = async (command: { actor: ActorRef; userId: number }) => {
    requireActorPermission(command.actor, "MANAGE_USERS");
    return { id: command.userId, points: 15 };
  };
  mocks.fakeModule.deductUserHours = async () => ({
    message: "5 horas retiradas com sucesso",
    user: { id: 1 },
  });
});

describe("GET/POST /api/users", () => {
  it("GET 200 {users}", async () => {
    const response = await usersList();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ users: [{ id: 1, name: "Ana" }] });
  });

  it("GET sem papel de visibilidade -> 403 com a mensagem congelada do use case (matriz real)", async () => {
    login([]);
    const response = await usersList();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Usuário não tem permissão para visualizar outros usuários",
      code: "FORBIDDEN",
    });
  });

  // B6-4: o caso "non-typed permission error keeps the legacy 403 fallback" saiu junto com o
  // fallback da rota — codigo morto (ForbiddenError ja era mapeado por domainErrorResponse).
  // Um Error cru com "nao tem permissao" na mensagem agora e 500, como qualquer nao-DomainError.

  it("GET unknown error -> 500 (generic preserved)", async () => {
    mocks.fakeModule.listUsersForActor = async () => {
      throw new Error("boom");
    };
    const response = await usersList();
    expect(response.status).toBe(500);
  });

  it("POST 201 {user}", async () => {
    const response = await usersCreate(
      makeRequest("/api/users", { method: "POST", body: { name: "Ana", email: "ana@x.com", password: "secret123" } }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).user.email).toBe("ana@x.com");
  });

  it("POST ValidationError -> 400 (was 400 by catch-all; message preserved + code added)", async () => {
    mocks.fakeModule.createUser = async () => {
      throw new ValidationError("A senha deve ter pelo menos 6 caracteres");
    };
    const response = await usersCreate(
      makeRequest("/api/users", { method: "POST", body: { name: "Ana", email: "a@x.com", password: "123" } }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "A senha deve ter pelo menos 6 caracteres",
      code: "VALIDATION_ERROR",
    });
  });

  it("POST duplicate email -> 409 ConflictError (evolution: was 400)", async () => {
    mocks.fakeModule.createUser = async () => {
      throw new ConflictError("Este email já está em uso");
    };
    const response = await usersCreate(
      makeRequest("/api/users", { method: "POST", body: { name: "Dup", email: "ana@x.com", password: "secret123" } }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("Este email já está em uso");
  });

  it("POST sem MANAGE_USERS -> 403 com a mensagem própria (gate no use case, assert na rota)", async () => {
    login(["VOLUNTARIO"]);
    const response = await usersCreate(
      makeRequest("/api/users", { method: "POST", body: { name: "Ana", email: "a@x.com", password: "secret123" } }),
    );
    expect(response.status).toBe(403);
    // B6-4 (DEC-53): corpo superset, mensagem própria intacta.
    expect(await response.json()).toMatchObject({
      error: "Sem permissão para criar usuários",
      code: "FORBIDDEN",
    });
  });
});

describe("/api/users/[id] GET/PUT/DELETE", () => {
  it("GET 200 / invalid id 400 / ausente => 404 legado {error} preservado (null do use case)", async () => {
    const ok = await userGet(makeRequest("/api/users/1"), idContext("1"));
    expect(ok.status).toBe(200);

    const invalid = await userGet(makeRequest("/api/users/abc"), idContext("abc"));
    expect(invalid.status).toBe(400);

    // B6-4: o use case devolve null (nao lanca) — a rota monta o 404 legado {error} verbatim,
    // sem code (mesma decisao do GET de purchases/[id] no B6-2d).
    mocks.fakeModule.findUserById = async () => null as never;
    const missing = await userGet(makeRequest("/api/users/99"), idContext("99"));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Usuário não encontrado" });
  });

  it("GET de outro sem MANAGE_USERS => 403 'Acesso negado' (self-or-manage no use case)", async () => {
    login(["VOLUNTARIO"], 42);
    const denied = await userGet(makeRequest("/api/users/1"), idContext("1"));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });

    // o dono (self) passa sem qualquer gestao
    login(["VOLUNTARIO"], 1);
    expect((await userGet(makeRequest("/api/users/1"), idContext("1"))).status).toBe(200);
  });

  it("PUT ValidationError (avatar) -> 400; NotFoundError -> 404", async () => {
    mocks.fakeModule.updateUser = async () => {
      throw new ValidationError("Imagem de perfil inválida");
    };
    const bad = await userPut(
      makeRequest("/api/users/1", { method: "PUT", body: { avatar: "https://evil.com/a.png" } }),
      idContext("1"),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("Imagem de perfil inválida");

    mocks.fakeModule.updateUser = async () => {
      throw new NotFoundError("Usuário não encontrado");
    };
    const missing = await userPut(makeRequest("/api/users/99", { method: "PUT", body: { name: "X" } }), idContext("99"));
    expect(missing.status).toBe(404);
  });

  it("DELETE NotFoundError -> 404 (was 500); success -> {success:true}", async () => {
    mocks.fakeModule.deleteUser = async () => {
      throw new NotFoundError("Usuário não encontrado");
    };
    const missing = await userDelete(makeRequest("/api/users/99", { method: "DELETE" }), idContext("99"));
    expect(missing.status).toBe(404);

    mocks.fakeModule.deleteUser = async () => undefined;
    const ok = await userDelete(makeRequest("/api/users/1", { method: "DELETE" }), idContext("1"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ success: true });
  });
});

describe("/api/users/[id]/roles|status|points PATCH", () => {
  it("roles: 200; invalid action 400; NotFoundError 404", async () => {
    const ok = await userRoles(
      makeRequest("/api/users/1/roles", { method: "PATCH", body: { action: "add", role: "PESQUISADOR" } }),
      idContext("1"),
    );
    expect(ok.status).toBe(200);

    const badAction = await userRoles(
      makeRequest("/api/users/1/roles", { method: "PATCH", body: { action: "estranho" } }),
      idContext("1"),
    );
    expect(badAction.status).toBe(400);

    mocks.fakeModule.updateUserRoles = async () => {
      throw new NotFoundError("Usuário não encontrado");
    };
    const missing = await userRoles(
      makeRequest("/api/users/99/roles", { method: "PATCH", body: { action: "add", role: "VOLUNTARIO" } }),
      idContext("99"),
    );
    expect(missing.status).toBe(404);
  });

  it("status: 200 suspended; NotFoundError 404", async () => {
    const ok = await userStatus(
      makeRequest("/api/users/1/status", { method: "PATCH", body: { action: "suspend" } }),
      idContext("1"),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).user.status).toBe("suspended");

    mocks.fakeModule.updateUserStatus = async () => {
      throw new NotFoundError("Usuário não encontrado");
    };
    const missing = await userStatus(
      makeRequest("/api/users/99/status", { method: "PATCH", body: { action: "suspend" } }),
      idContext("99"),
    );
    expect(missing.status).toBe(404);
  });

  it("points: ValidationError insufficient -> 400 with message (was 500); invalid body 400", async () => {
    mocks.fakeModule.updateUserPoints = async () => {
      throw new ValidationError("Usuário não possui pontos suficientes");
    };
    const insufficient = await userPoints(
      makeRequest("/api/users/1/points", { method: "PATCH", body: { action: "remove", points: 999 } }),
      idContext("1"),
    );
    expect(insufficient.status).toBe(400);
    expect((await insufficient.json()).error).toBe("Usuário não possui pontos suficientes");

    const invalidBody = await userPoints(
      makeRequest("/api/users/1/points", { method: "PATCH", body: { action: "add", points: -1 } }),
      idContext("1"),
    );
    expect(invalidBody.status).toBe(400);
  });
});

describe("/api/users/[id]/deduct-hours POST", () => {
  it("200 {message,user}", async () => {
    const response = await deductHours(
      makeRequest("/api/users/1/deduct-hours", { method: "POST", body: { hours: 5, reason: "ausência" } }) as never,
      idContext("1"),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).message).toBe("5 horas retiradas com sucesso");
  });

  it("ForbiddenError (A4) -> 403 with message (replaces message-matching fallback)", async () => {
    mocks.fakeModule.deductUserHours = async () => {
      throw new ForbiddenError("Acesso negado");
    };
    const response = await deductHours(
      makeRequest("/api/users/1/deduct-hours", { method: "POST", body: { hours: 1, reason: "r", projectId: 7 } }) as never,
      idContext("1"),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Acesso negado");
  });

  it("ValidationError insufficient hours -> 400 with message (was 500 with hidden message)", async () => {
    mocks.fakeModule.deductUserHours = async () => {
      throw new ValidationError("Usuário não possui horas suficientes");
    };
    const response = await deductHours(
      makeRequest("/api/users/1/deduct-hours", { method: "POST", body: { hours: 99, reason: "r" } }) as never,
      idContext("1"),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Usuário não possui horas suficientes");
  });

  it("NotFoundError -> 404; invalid body -> 400", async () => {
    mocks.fakeModule.deductUserHours = async () => {
      throw new NotFoundError("Usuário não encontrado");
    };
    const missing = await deductHours(
      makeRequest("/api/users/99/deduct-hours", { method: "POST", body: { hours: 1, reason: "r" } }) as never,
      idContext("99"),
    );
    expect(missing.status).toBe(404);

    const invalid = await deductHours(
      makeRequest("/api/users/1/deduct-hours", { method: "POST", body: { hours: 0, reason: "r" } }) as never,
      idContext("1"),
    );
    expect(invalid.status).toBe(400);
  });
});

describe("/api/users/[id]/profile + /api/users/approve", () => {
  it("profile GET 200; PATCH ValidationError -> 400", async () => {
    const ok = await profileGet(makeRequest("/api/users/1/profile"), idContext("1"));
    expect(ok.status).toBe(200);

    mocks.fakeModule.updateUserProfile = async () => {
      throw new ValidationError("Senha deve ter pelo menos 6 caracteres");
    };
    const bad = await profilePatch(
      makeRequest("/api/users/1/profile", { method: "PATCH", body: { password: "short" } }),
      idContext("1"),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("Senha deve ter pelo menos 6 caracteres");
  });

  it("approve GET 200 {pendingUsers}", async () => {
    const response = await approveList();
    expect(response.status).toBe(200);
    expect((await response.json()).pendingUsers).toHaveLength(1);
  });

  it("approve POST 200 {user,message}; NotFoundError -> 404 'Usuário não encontrado' (mapped, replaces P2025-only branch)", async () => {
    const ok = await approveModerate(
      makeRequest("/api/users/approve", { method: "POST", body: { userId: 4, action: "approve" } }),
    );
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.message).toBe("Usuário aprovado com sucesso");
    expect(body.user.status).toBe("active");

    mocks.fakeModule.moderatePendingUser = async () => {
      throw new NotFoundError("Usuário não encontrado");
    };
    const missing = await approveModerate(
      makeRequest("/api/users/approve", { method: "POST", body: { userId: 99, action: "approve" } }),
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe("Usuário não encontrado");
  });
});

describe("POST /api/auth/register (via RegisterUserUseCase, no prisma/bcrypt in the route)", () => {
  it("201 with the frozen shape {message, user:{id,name,email,status,createdAt}}", async () => {
    const response = await register(
      makeRequest("/api/auth/register", {
        method: "POST",
        body: { name: "New Volunteer", email: "NEW@X.com", password: "secret123" },
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(Object.keys(body.user)).toEqual(["id", "name", "email", "status", "createdAt"]);
    expect(body.user.status).toBe("pending");
    expect(body.user.email).toBe("new@x.com");
    expect(body.message).toBe("Conta criada com sucesso! Sua solicitação será analisada por um coordenador ou gerente.");
  });

  it("missing fields -> 400 with the register form message", async () => {
    mocks.fakeModule.registerUser = async () => {
      throw new ValidationError("Nome, email e senha são obrigatórios");
    };
    const response = await register(
      makeRequest("/api/auth/register", { method: "POST", body: { name: "N", email: "", password: "" } }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Nome, email e senha são obrigatórios");
  });

  it("short password -> 400 with the frozen message", async () => {
    mocks.fakeModule.registerUser = async () => {
      throw new ValidationError("A senha deve ter pelo menos 6 caracteres");
    };
    const response = await register(
      makeRequest("/api/auth/register", { method: "POST", body: { name: "N", email: "n@x.com", password: "123" } }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("A senha deve ter pelo menos 6 caracteres");
  });

  it("duplicate email -> 409 ConflictError (evolution: was hand-rolled 400)", async () => {
    mocks.fakeModule.registerUser = async () => {
      throw new ConflictError("Este email já está em uso");
    };
    const response = await register(
      makeRequest("/api/auth/register", { method: "POST", body: { name: "Dup", email: "dup@x.com", password: "secret123" } }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("Este email já está em uso");
  });
});
