// @vitest-environment node
/**
 * plan-v9 S03 (MODELO §7, CA4, CA8, R12) — `GET /api/board` e a leitura de um mês fechado.
 *
 * Escrito antes do código. O módulo é REAL sobre uma porta falsa, o mesmo desenho de
 * `monthly-board-close-route.test.ts`: dobrar o módulo faria a resposta ser a do duplo.
 *
 * O que este arquivo trava:
 *  - mês fechado devolve valor e posição congelados, e não o quadro vivo (CA4). A prova é que
 *    nenhuma leitura de gente viva acontece no caminho da leitura de mês;
 *  - mês nunca fechado devolve quadro vazio com aviso, nomeando o mês pedido, e não o quadro do
 *    mês em curso (CA8). cair no `?? quadro atual` é exatamente o defeito que CA8 existe para pegar;
 *  - mês com forma inválida é 400 nomeando o campo, não 500 nem "mês atual";
 *  - `GET /api/board` sem mês continua declarando o mês corrente e passa a listar os meses que
 *    já fecharam, porque a tela não tem como saber quais meses existe abrir.
 *
 * Relógio congelado em 1 de fevereiro de 2028 (Sao Paulo), para o mês corrente ser fevereiro e
 * os meses pedidos (janeiro, dezembro) serem sempre meses passados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createGamificationModule } from "@/backend/modules/gamification";
import type { BoardMonthClosePort } from "@/backend/modules/gamification/application/ports/board-month-close.port";
import type { MonthClosePerson, MonthCloseRow } from "@/backend/domain/gamification";

const RUN_INSTANT = "2028-02-01T03:00:01.000Z"; // 00:00:01 de 1 de fevereiro, Sao Paulo

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  closedRows: [] as MonthCloseRow[],
  closedMonths: [] as Array<{ month: string; closedAt: Date; peopleCount: number }>,
  closedMonthsForUser: [] as MonthCloseRow[],
  people: [] as MonthClosePerson[],
  liveReads: 0,
  monthReads: [] as string[],
}));

vi.mock("@/backend/composition/root", () => {
  const monthClose: BoardMonthClosePort = {
    async findClosedMonth(month) {
      return mocks.closedMonths.some((closed) => closed.month === month)
        ? { month, closedAt: new Date("2028-02-01T03:00:00.000Z") }
        : null;
    },
    async listPeopleForClose() {
      mocks.liveReads += 1;
      return mocks.people;
    },
    async writeClose() {
      throw new Error("leitura de quadro nao escreve fechamento");
    },
    async readClosedMonth(month) {
      mocks.monthReads.push(month);
      const closed = mocks.closedMonths.find((entry) => entry.month === month);
      if (!closed) return null;
      return {
        closedAt: closed.closedAt,
        peopleCount: closed.peopleCount,
        triggeredBy: "SYSTEM:MONTH_CLOSE",
        rows: mocks.closedRows,
      };
    },
    async listClosedMonths() {
      return mocks.closedMonths;
    },
    async listClosedMonthsForUser() {
      return mocks.closedMonthsForUser ?? [];
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

import { GET } from "@/app/api/board/route";

function login() {
  mocks.session = { id: 42, email: "pessoa@lab.com", name: "Pessoa", roles: ["VOLUNTARIO"], status: "active" };
}

function request(month?: string) {
  const url = new URL("/api/board", "http://localhost:3000");
  if (month !== undefined) url.searchParams.set("month", month);
  return new NextRequest(url, { method: "GET" });
}

/** Chama o handler da rota. `GET` e o handler, `request` e a requisicao. */
async function call(month?: string): Promise<Response> {
  return await GET(request(month));
}

const read = async (response: Response) => await response.json();

function closedRow(over: Partial<MonthCloseRow> & { userId: number; userName: string; value: number; position: number }): MonthCloseRow {
  const base = new Date("2028-01-01T03:00:00.000Z");
  return {
    month: "2028-01",
    track: "MONTH_POINTS",
    periodStart: base,
    periodEnd: base,
    closedAt: base,
    ...over,
  };
}

describe("GET /api/board?month= — CA4: mês fechado é leitura congelada", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(RUN_INSTANT));
    login();
    mocks.closedMonths = [{ month: "2028-01", closedAt: new Date("2028-02-01T03:00:00.000Z"), peopleCount: 3 }];
    // As linhas chegam do fake FORA da ordem de posição — como chegariam do banco se a escrita ou a
    // leitura não ordenassem. A resposta tem que sair ordenada pela posição gravada (CA4).
    mocks.closedRows = [
      closedRow({ userId: 9, userName: "Caio Braga", value: -40, position: 3 }),
      closedRow({ userId: 7, userName: "Ana Prado", value: 30, position: 1 }),
      closedRow({ userId: 8, userName: "Bia Serra", value: 0, position: 2 }),
    ];
    // Gente viva com placar diferente: se a leitura de mês fechado olhar a base viva, o corpo muda.
    mocks.people = [
      { id: 7, name: "Ana Prado", status: "active", currentMonthPoints: 900 },
      { id: 8, name: "Bia Serra", status: "active", currentMonthPoints: 900 },
    ];
    mocks.liveReads = 0;
    mocks.monthReads = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    mocks.session = null;
  });

  it("devolve valor e posição congelados, com o mês que foi pedido", async () => {
    const body = await read(await call("2028-01"));

    expect(body.month).toBe("2028-01");
    expect(body.monthLabel).toBe("janeiro de 2028");
    expect(body.track).toBe("MONTH_POINTS");
    expect(body.closed).toBe(true);
    expect(body.entries).toEqual([
      { userId: 7, name: "Ana Prado", value: 30, position: 1 },
      { userId: 8, name: "Bia Serra", value: 0, position: 2 },
      { userId: 9, name: "Caio Braga", value: -40, position: 3 },
    ]);
  });

  it("declara que o mês está fechado e nomeia o mês, para a tela dizer isso sem depender do seletor", async () => {
    const body = await read(await call("2028-01"));
    expect(body.notice).toContain("fechado");
    expect(body.notice).toContain("janeiro de 2028");
  });

  it("não lê a base viva: o quadro de mês fechado não é recalculado (CA4)", async () => {
    const body = await read(await call("2028-01"));
    expect(mocks.liveReads).toBe(0);
    expect(mocks.monthReads).toEqual(["2028-01"]);
    // 900 é o placar vivo das mesmas pessoas. Nada dele entra na resposta.
    expect(JSON.stringify(body)).not.toContain("900");
  });
});

describe("GET /api/board?month= — CA8 e R9: mês nunca fechado é quadro vazio com aviso, mês corrente é placar vivo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(RUN_INSTANT));
    login();
    mocks.closedMonths = [{ month: "2028-01", closedAt: new Date("2028-02-01T03:00:00.000Z"), peopleCount: 3 }];
    mocks.closedRows = [closedRow({ userId: 7, userName: "Ana Prado", value: 30, position: 1 })];
    mocks.people = [{ id: 7, name: "Ana Prado", status: "active", currentMonthPoints: 77 }];
    mocks.liveReads = 0;
    mocks.monthReads = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    mocks.session = null;
  });

  it("devolve quadro vazio, nomeando o mês pedido, e não o quadro do mês em curso", async () => {
    const body = await read(await call("2027-12"));

    expect(body.month).toBe("2027-12");
    expect(body.monthLabel).toBe("dezembro de 2027");
    expect(body.closed).toBe(false);
    expect(body.entries).toEqual([]);
    expect(body.notice).toContain("dezembro de 2027");
    // O placar vivo da mesma pessoa nao pode aparecer: a resposta e do mes pedido.
    expect(JSON.stringify(body)).not.toContain("77");
  });

  it("mês com forma inválida é recusado nomeando o campo, sem inventar mês", async () => {
    // "" entra porque `?month=` com valor vazio tem que ser 400: cair no ramo do mês corrente
    // responderia com quadro vivo o que o dono pediu como mês — mentira com o sinal trocado.
    for (const month of ["2028-13", "outubro", "2028", ""]) {
      const response = await call(month);
      expect(response.status).toBe(400);
      const body = await read(response);
      expect(body.error).toContain("month");
    }
    expect(mocks.monthReads).toEqual([]);
  });

  it("R9: o mês corrente pedido responde pelo placar vivo, nunca por quadro vazio", async () => {
    const body = await read(await call("2028-02"));

    expect(body.month).toBe("2028-02");
    expect(body.monthLabel).toBe("fevereiro de 2028");
    expect(body.closed).toBe(false);
    // `live` e o que distingue "resolve pelo placar vivo" de "quadro vazio" (CA8).
    expect(body.live).toBe(true);
    expect(body.entries).toEqual([]);
    expect(body.notice).toContain("fevereiro de 2028");
    expect(body.notice).not.toContain("vazio");
    // Nenhuma leitura de fechamento: o mes em curso nao e mes fechado.
    expect(mocks.monthReads).toEqual([]);
  });
});

describe("GET /api/board — mês em curso e a lista de meses fechados", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(RUN_INSTANT));
    login();
    mocks.closedMonths = [
      { month: "2028-01", closedAt: new Date("2028-02-01T03:00:00.000Z"), peopleCount: 3 },
      { month: "2027-12", closedAt: new Date("2028-01-01T03:00:00.000Z"), peopleCount: 1 },
    ];
    mocks.closedRows = [];
    mocks.people = [];
    mocks.liveReads = 0;
    mocks.monthReads = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    mocks.session = null;
  });

  it("sem mês na query: fevereiro de 2028, aberto, com os meses que já fecharam", async () => {
    const body = await read(await call());

    expect(body.month).toBe("2028-02");
    expect(body.monthLabel).toBe("fevereiro de 2028");
    expect(body.closed).toBe(false);
    expect(body.closedMonths).toEqual([
      { month: "2028-01", monthLabel: "janeiro de 2028" },
      { month: "2027-12", monthLabel: "dezembro de 2027" },
    ]);
  });

  it("nenhuma sessão: 401 nos dois caminhos, sem leitura de mês", async () => {
    mocks.session = null;

    expect((await call()).status).toBe(401);
    expect((await call("2028-01")).status).toBe(401);
    expect(mocks.monthReads).toEqual([]);
  });
});
