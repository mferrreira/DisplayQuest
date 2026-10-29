// @vitest-environment node
/**
 * plan-v9 S02 (MODELO §7, §8 CA2, CA9; R6, R11; DEC-226) — `POST /api/board/close`.
 *
 * O módulo é REAL sobre uma porta falsa, como `badge-authorization.test.ts`: dobrar o módulo
 * faria o 403 ser o 403 do duplo, não do sistema. Aqui a autoridade decide no use case, e o que
 * se prova é a ordem: gate antes de ler gente e antes de escrever qualquer coisa (CA9).
 *
 * Relógio congelado em 1 de fevereiro de 2028 às 00:00:01 (Sao Paulo), para o mês fechado ser
 * sempre janeiro de 2028 e o período ser comparado em instantes exatos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createGamificationModule } from "@/backend/modules/gamification";
import { MONTH_CLOSE_DENIED_MESSAGE } from "@/backend/modules/gamification/application/use-cases/close-board-month.use-case";
import type {
  BoardMonthClosePort,
  MonthCloseWrite,
} from "@/backend/modules/gamification/application/ports/board-month-close.port";
import type { MonthClosePerson } from "@/backend/domain/gamification/month-close-rules";

const RUN_INSTANT = "2028-02-01T03:00:01.000Z"; // 00:00:01 de 1 de fevereiro, Sao Paulo

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  people: [] as MonthClosePerson[],
  closedMarker: null as null | { closedAt: Date },
  writes: [] as MonthCloseWrite[],
  reads: 0,
}));

vi.mock("@/backend/composition/root", () => {
  const monthClose: BoardMonthClosePort = {
    async findClosedMonth(month) {
      return mocks.closedMarker ? { month, closedAt: mocks.closedMarker.closedAt } : null;
    },
    async listPeopleForClose() {
      mocks.reads += 1;
      return mocks.people;
    },
    async writeClose(input) {
      mocks.writes.push(input);
    },
    // O fechamento nao lee mes fechado nem lista meses. Se um caminho novo usar estas portas aqui,
    // o erro e alto em vez de silencioso (padrao da casa para porta nao exercitada).
    async readClosedMonth() {
      throw new Error("leitura de mes fechado nao deveria acontecer no fechamento");
    },
    async listClosedMonths() {
      throw new Error("lista de meses fechados nao deveria acontecer no fechamento");
    },
    async listClosedMonthsForUser() {
      throw new Error("lista de meses de pessoa nao deveria acontecer no fechamento");
    },
  };

  // As outras portas existem porque `createGamificationModule` constrói o módulo inteiro.
  const unused = new Proxy(
    {},
    {
      get: (_target, property) => (): never => {
        throw new Error(`porta de gamification não deveria ser usada neste teste: ${String(property)}`);
      },
    },
  ) as never;

  const realGamification = createGamificationModule({
    ports: { monthClose, users: unused, awardHistory: unused, badges: unused, userBadges: unused, stats: unused },
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

import { POST } from "@/app/api/board/close/route";

/** MANAGE_USERS, segundo a matriz real (`backend/domain/identity/permissions.ts`). */
const MANAGER_ROLES = [["COORDENADOR"], ["GERENTE"]];
const NO_MANAGEMENT_ROLES = [["VOLUNTARIO"], ["GERENTE_PROJETO"], ["LABORATORISTA"]];

function login(roles: string[], id = 42) {
  mocks.session = { id, email: "gestor@lab.com", name: "Gestor", roles, status: "active" };
}

function logout() {
  mocks.session = null;
}

function request() {
  return new NextRequest(new URL("/api/board/close", "http://localhost:3000"), {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
}

const read = async (response: Response) => await response.json();

describe("POST /api/board/close — CA9: a recusa vem antes de qualquer efeito", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(RUN_INSTANT));
    mocks.people = [
      { id: 7, name: "Ana", status: "active", currentMonthPoints: 30 },
      { id: 8, name: "Bia", status: "active", currentMonthPoints: 0 },
      { id: 9, name: "Caio", status: "suspended", currentMonthPoints: 12 },
    ];
    mocks.closedMarker = null;
    mocks.writes = [];
    mocks.reads = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    logout();
  });

  it("sem sessão: 401 e nada lido nem escrito", async () => {
    logout();
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.reads).toBe(0);
    expect(mocks.writes).toHaveLength(0);
  });

  it("quem não tem MANAGE_USERS: 403 com a mensagem congelada, e nenhuma leitura de gente", async () => {
    for (const roles of NO_MANAGEMENT_ROLES) {
      login(roles);
      const response = await POST(request());
      expect(response.status).toBe(403);
      expect(await read(response)).toMatchObject({ error: MONTH_CLOSE_DENIED_MESSAGE });
    }
    expect(mocks.reads).toBe(0);
    expect(mocks.writes).toHaveLength(0);
  });
});

describe("POST /api/board/close — gestão fecha o mês", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(RUN_INSTANT));
    mocks.people = [
      { id: 7, name: "Ana", status: "active", currentMonthPoints: 30 },
      { id: 8, name: "Bia", status: "active", currentMonthPoints: 0 },
      { id: 9, name: "Caio", status: "suspended", currentMonthPoints: 12 },
    ];
    mocks.closedMarker = null;
    mocks.writes = [];
    mocks.reads = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    logout();
  });

  // Cada caso e um objeto com o array dentro: `it.each` sobre arrays de arrays espalha o papel e
  // entregaria a string solta para `login`, e `normalizeRoles` do `requireApiActor` transformaria
  // a string em `[]` e negaria todo mundo (a armadilha ja medida na DEC do B6-2a).
  it.each(MANAGER_ROLES.map((roles) => ({ roles })))("POST sem corpo com $roles: 200 com janeiro de 2028 fechado", async ({ roles }) => {
    login(roles);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await read(response)).toMatchObject({
      month: "2028-01",
      monthLabel: "janeiro de 2028",
      track: "MONTH_POINTS",
      closed: true,
      alreadyClosed: false,
      peopleCount: 2,
      periodStart: "2028-01-01T03:00:00.000Z",
      periodEnd: "2028-02-01T02:59:59.999Z",
      triggeredBy: "USER:42",
    });
  });

  it("a escrita recebida carrega as linhas e zera o placar de toda pessoa da base (R11)", async () => {
    login(["COORDENADOR"]);
    await POST(request());

    expect(mocks.writes).toHaveLength(1);
    const write = mocks.writes[0];
    expect(write.month).toBe("2028-01");
    expect(write.track).toBe("MONTH_POINTS");
    expect(write.rows.map((row) => [row.userId, row.value, row.position])).toEqual([
      [7, 30, 1],
      [8, 0, 2],
    ]);
    // Caio nao recebeu linha (status diferente de active) e mesmo assim tem o placar do mes zerado.
    expect(write.userIdsToZero).toEqual([7, 8, 9]);
  });

  it("o nome das pessoas excluídas da linha chega na resposta (CA7)", async () => {
    login(["GERENTE"]);
    const body = await read(await POST(request()));
    expect(body.excluded).toEqual([{ userId: 9, status: "suspended" }]);
  });
});

describe("POST /api/board/close — CA2: run repetida não muda nada", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(RUN_INSTANT));
    mocks.people = [{ id: 7, name: "Ana", status: "active", currentMonthPoints: 30 }];
    mocks.closedMarker = { closedAt: new Date("2028-02-01T03:00:00.000Z") };
    mocks.writes = [];
    mocks.reads = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    logout();
  });

  it("mês já fechado: closed false, alreadyClosed true, e nenhuma escrita", async () => {
    login(["COORDENADOR"]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await read(response)).toMatchObject({
      month: "2028-01",
      closed: false,
      alreadyClosed: true,
      peopleCount: 0,
    });
    expect(mocks.writes).toHaveLength(0);
  });
});
