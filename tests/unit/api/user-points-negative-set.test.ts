// @vitest-environment node
/**
 * V4-6 (DEC-60) — `set` de pontos passa a aceitar valor negativo.
 *
 * Por que isto é uma decisão e não uma correção: a premiação **produz** total negativo (DEC-39,
 * penalidade sem piso), mas nenhum caminho de administração conseguia escrevê-lo. Medido na
 * instância real em 2026-10-05: Coordenador em −20, Gerente em −31030. Um coordenador que ficou
 * negativo por atraso não podia ser ajustado de volta — só a zero ou para cima.
 *
 * Rejeitavam em DOIS lugares, e isso é o que torna o lote mais largo que "tirar um if":
 *
 *   rota  `app/api/users/[id]/points/route.ts:24` — `points < 0` → 400, e vem ANTES do check de
 *         ação, então nem `add`/`remove` negativos chegavam ao use case;
 *   use case `UpdateUserPointsUseCase` — o ramo `set` também rejeitava entrada negativa.
 *
 * O dono escolheu a alternativa estreita: **só `set` ganha a capacidade**. `add` continua com
 * chão em 0 (`Math.max`) e `remove` continua exigindo suficiência. Consequência medida deste
 * escolha: a rota precisa conhecer a ação antes de validar o número, o que **inverte a
 * precedência de dois 400** — hoje `{action:"bogus", points:-5}` devolve "Pontos devem ser um
 * número não negativo"; depois devolve "Ação inválida". Este arquivo fixa os dois lados.
 *
 * Módulo REAL sobre porta falsa, não duplo de módulo (a lição medida do B6-2a: duplo de módulo
 * faz a recusa SUMIR do teste em vez de falhar).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createUserManagementModule } from "@/backend/modules/user-management";
import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import type { UserRepositoryPort, UserRecord } from "@/backend/modules/user-management/application/ports/user.repository";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  /** O último `update` recebido pela porta — é o que prova o valor escrito. */
  written: null as null | UserRecord,
}));

vi.mock("@/backend/composition/root", () => {
  const seed = (): UserRecord =>
    ({
      id: 2,
      name: "Coordenador",
      email: "coord@lab.com",
      password: "bcrypt:x",
      status: "active",
      points: 0,
      completedTasks: 4,
      weekHours: 0,
      currentWeekHours: 0,
      roles: ["COORDENADOR"],
      avatar: null,
      bio: null,
      profileVisibility: "public",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }) as UserRecord;

  let store = seed();
  const boom = (name: string) => async () => {
    throw new Error(`porta não deveria ser usada neste teste: ${name}`);
  };

  const repository: UserRepositoryPort = {
    findById: async (id) => (id === 2 ? store : null),
    update: async (user) => {
      store = { ...store, ...user } as UserRecord;
      mocks.written = store;
      return store;
    },
    countBlockingDependencies: boom("countBlockingDependencies"),
    delete: boom("delete"),
    findByEmail: boom("findByEmail"),
    create: boom("create"),
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

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { PATCH } from "@/app/api/users/[id]/points/route";

/** Array porque `requireApiActor` normaliza com `normalizeRoles`: string solta vira `[]`. */
function login(roles: string[]) {
  mocks.session = { id: 99, email: "admin@lab.com", name: "Admin", roles, status: "active" };
}

function patch(body: unknown) {
  return PATCH(new NextRequest(new URL("/api/users/2/points", "http://localhost:3000"), {
    method: "PATCH",
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: "2" }) });
}

const read = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.session = null;
  mocks.written = null;
  login(["COORDENADOR"]);
});

describe("PATCH /api/users/[id]/points — set aceita negativo (DEC-60)", () => {
  it("set negativo escreve o negativo: 200 e o valor chega à porta", async () => {
    const response = await patch({ action: "set", points: -20 });
    expect(response.status).toBe(200);
    expect((await read(response)).user.points).toBe(-20);
    expect(mocks.written?.points).toBe(-20);
  });

  it("set negativo a partir de zero não é barrado por o usuário 'não ter' pontos", async () => {
    // `remove` exige suficiência; `set` não tem nada a ver com suficiência — é um valor absoluto.
    const response = await patch({ action: "set", points: -31030 });
    expect(response.status).toBe(200);
    expect((await read(response)).user.points).toBe(-31030);
  });

  it("add continua com chão em 0 e continua recusando entrada negativa na rota", async () => {
    const response = await patch({ action: "add", points: -1 });
    expect(response.status).toBe(400);
    // Mensagem preservada de propósito: é a mesma que a rota devolve hoje, e o lote não muda
    // contrato de mensagem — só deixa de aplicá-la quando a ação é `set`.
    expect((await read(response)).error).toBe("Pontos devem ser um número não negativo");
  });

  it("remove continua recusando entrada negativa", async () => {
    const response = await patch({ action: "remove", points: -1 });
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Pontos devem ser um número não negativo");
  });

  it("precedência medida: ação inválida com points negativo denuncia a AÇÃO, não o número", async () => {
    // Antes deste lote a rota validava o número antes da ação, então este corpo devolvia
    // "Pontos devem ser um número não negativo". Para saber se `points` pode ser negativo a
    // rota precisa saber a ação primeiro — e é isso que este caso congela.
    const response = await patch({ action: "bogus", points: -5 });
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Ação inválida");
  });

  it("points que não é número continua 400", async () => {
    const response = await patch({ action: "set", points: "abc" });
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Pontos devem ser um número não negativo");
  });

  it("quirk medido e preservado, não adotado: `points: null` chega como 0 e escreve 0", async () => {
    // JSON não tem `Infinity`: `JSON.stringify(Infinity)` devolve `null`, e `Number(null)` é 0.
    // Medido ao escrever este lote (a primeira versão deste caso assumiu que Infinity chegava
    // como Infinity e passou com 200). Consequência real: um corpo `{action:"set", points:null}`
    // zera os pontos de um usuário em vez de ser recusado. Não é corrigido aqui porque está fora
    // do alcance da DEC-60; está registrado em PLAN.md §6 para o dono decidir.
    const response = await patch({ action: "set", points: null });
    expect(response.status).toBe(200);
    expect((await read(response)).user.points).toBe(0);
  });

  it("quem não tem MANAGE_USERS leva 403 antes de qualquer 400", async () => {
    login(["VOLUNTARIO"]);
    const response = await patch({ action: "set", points: -20 });
    expect(response.status).toBe(403);
    expect(mocks.written).toBeNull();
  });
});
