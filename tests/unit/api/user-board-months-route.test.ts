// @vitest-environment node
/**
 * plan-v9 S04 (MODELO §7, R12, DEC-232) — `GET /api/users/[id]/board-months`.
 *
 * Escrito depois do conserto apontado pelo review (a rota nova estava sem pin), no MESMO desenho
 * de `monthly-board-read-route.test.ts`: módulo REAL sobre a porta falsa — dobrar o módulo faria
 * a resposta ser a do duplo (lição B6-2a).
 *
 * O que este arquivo trava:
 *  - leitura do autenticado (R12): sem sessão é 401 e nenhuma leitura da porta de histórico
 *    acontece — autenticação é o portão, e não há gate novo de leitura;
 *  - `id` que não é número de pessoa é 400 "id invalido" e não chega ao use case: é o endereço
 *    do recurso (Next 15: `params` é `Promise`, e o handler que `Number(id)` antes de chamar);
 *  - com id válido, o corpo é a leitura do use case com `userId` numérico.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createGamificationModule } from "@/backend/modules/gamification";
import type { BoardMonthClosePort } from "@/backend/modules/gamification/application/ports/board-month-close.port";
import type { MonthCloseRow } from "@/backend/domain/gamification";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  rowsForUser: [] as Array<{ userId: number; track: string }>,
  reads: [] as Array<{ userId: number; track: string }>,
}));

vi.mock("@/backend/composition/root", () => {
  const monthClose: BoardMonthClosePort = {
    async findClosedMonth() {
      throw new Error("buscar mes fechado nao deveria acontecer nos meses de pessoa");
    },
    async listPeopleForClose() {
      throw new Error("listar pessoas nao deveria acontecer nos meses de pessoa");
    },
    async writeClose() {
      throw new Error("leitura de meses de pessoa nao escreve fechamento");
    },
    async readClosedMonth() {
      throw new Error("leitura de mes fechado nao deveria acontecer nos meses de pessoa");
    },
    async listClosedMonths() {
      throw new Error("lista de meses fechados nao deveria acontecer nos meses de pessoa");
    },
    async listClosedMonthsForUser(userId, track) {
      mocks.reads.push({ userId, track });
      return mocks.rowsForUser as unknown as MonthCloseRow[];
    },
  };

  const unused = new Proxy(
    {},
    {
      get: (_target, property) => (): never => {
        throw new Error(`porta de gamification não deveria ser usada neste teste: ${String(property)}`);
      },
    },
  ) as never;

  const realGamification = createGamificationModule({
    ports: {
      monthClose,
      users: unused,
      awardHistory: unused,
      badges: unused,
      userBadges: unused,
      stats: unused,
    },
  });

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      gamification: realGamification,
    }),
  };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { GET } from "@/app/api/users/[id]/board-months/route";

/** Next 15: handler de rota dinâmica recebe `{ params: Promise<…> }` (não montar dá 500). */
function request(): Parameters<typeof GET>[0] {
  return new NextRequest(new URL("/api/users/x/board-months", "http://localhost:3000"), { method: "GET" });
}

async function call(id: string): Promise<Response> {
  return await GET(request(), { params: Promise.resolve({ id }) });
}

describe("GET /api/users/[id]/board-months — os meses de uma pessoa no perfil", () => {
  beforeEach(() => {
    mocks.session = { id: 42, email: "pessoa@lab.com", name: "Pessoa", roles: ["VOLUNTARIO"], status: "active" };
    mocks.rowsForUser = [];
    mocks.reads = [];
  });

  afterEach(() => {
    mocks.session = null;
  });

  it("sem sessão é 401, e nenhuma leitura do histórico acontece", async () => {
    mocks.session = null;

    expect((await call("22")).status).toBe(401);
    expect(mocks.reads).toEqual([]);
  });

  it("id que não é número de pessoa é 400 nomeando o campo, sem chegar ao use case", async () => {
    for (const bad of ["abc", "0", "-3", "12.5"]) {
      const response = await call(bad);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("id");
    }
    // "0" e negativo saem do guarda da rota; "abc" também — nenhum chega à porta.
    expect(mocks.reads).toEqual([]);
  });

  it("id válido devolve a leitura do use case com userId numérico e a trilha do placar", async () => {
    const base = new Date("2028-01-01T03:00:00.000Z");
    // Linhas em ordem de chegada desordenada: a ordem de exibição é contrato do use case (desc).
    mocks.rowsForUser = [
      {
        userId: 22,
        userName: "Carla Lima",
        month: "2027-12",
        track: "MONTH_POINTS",
        value: 40,
        position: 2,
        periodStart: base,
        periodEnd: base,
        closedAt: base,
      },
      {
        userId: 22,
        userName: "Carla Lima",
        month: "2028-01",
        track: "MONTH_POINTS",
        value: 30,
        position: 1,
        periodStart: base,
        periodEnd: base,
        closedAt: base,
      },
    ] as unknown as MonthCloseRow[];

    const response = await call("22");
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.userId).toBe(22);
    expect(body.track).toBe("MONTH_POINTS");
    // A porta recebeu o número (não a string) e a trilha do placar do mês é fixa (ADR-001).
    expect(mocks.reads).toEqual([{ userId: 22, track: "MONTH_POINTS" }]);
    // A leitura sai do mais recente para o mais antigo: o use case ordenou, o banco não decide.
    expect(body.months).toEqual([
      { month: "2028-01", monthLabel: "janeiro de 2028", value: 30, position: 1 },
      { month: "2027-12", monthLabel: "dezembro de 2027", value: 40, position: 2 },
    ]);
    // A lista não está vazia: o aviso de vazio não acompanha a resposta cheia.
    expect(body.notice).toBe("");
  });
});
