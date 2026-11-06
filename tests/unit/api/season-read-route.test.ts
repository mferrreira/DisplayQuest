// @vitest-environment node
/**
 * plan-v20 S02 (DEC-252, DEC-255; CA4/CA8 do mês espelhados) — `GET /api/board?year=AAAA` e a
 * resposta de temporada na leitura sem parâmetro.
 *
 * O módulo é REAL sobre a porta fake de fechamento, como `monthly-board-read-route.test.ts`. Os
 * contratos que a tela não pode decidir sozinha, congelandos aqui:
 *  - ano fechado devolve valor e posição congelados e diz `closed: true`;
 *  - ano nunca fechado devolve quadro vazio com aviso nomeando o ANO pedido, nunca o quadro em
 *    curso (CA8 espelhada);
 *  - o ano em curso pedido por nome responde `live: true` com `entries: []` (R9 espelhada);
 *  - ano malformado é 400 nomeando o campo; ano anterior à primeira temporada (2026) é recusado
 *    pela regra do domínio;
 *  - a leitura sem parâmetro declara `seasonYear` e `closedSeasons`, para a aba Temporada não
 *    deduzir anos (DEC-132).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createGamificationModule } from "@/backend/modules/gamification";
import type { BoardMonthClosePort } from "@/backend/modules/gamification/application/ports/board-month-close.port";

const NOW = "2028-06-15T12:00:00.000Z"; // o ano civil em curso, no fuso do laboratório, é 2028

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  closedSeasons: [] as Array<{ month: string; closedAt: Date; peopleCount: number }>,
  closedMonths: [] as Array<{ month: string; closedAt: Date; peopleCount: number }>,
  closedMonthRows: [] as never[],
  seasonRows: [] as never[],
  yearReads: [] as string[],
  seasonListReads: 0,
  monthListReads: 0,
}));

vi.mock("@/backend/composition/root", () => {
  const monthClose: BoardMonthClosePort = {

    async listPeopleForClose() {
      throw new Error("leitura da base não deveria acontecer na leitura do quadro");
    },
    async listPeopleForSeasonClose() {
      throw new Error("leitura da base de temporada não deveria acontecer na leitura do quadro");
    },
    async writeClose() {
      throw new Error("leitura de quadro não escreve fechamento");
    },
    async readClosedMonth(month, track) {
      if (track === "SEASON_POINTS") {
        mocks.yearReads.push(month);
        const closed = mocks.closedSeasons.find((entry) => entry.month === month);
        if (!closed) return null;
        return {
          closedAt: closed.closedAt,
          peopleCount: closed.peopleCount,
          triggeredBy: "SYSTEM:SEASON_CLOSE",
          rows: mocks.seasonRows,
        };
      }
      return null;
    },
    async listClosedMonths(track) {
      if (track === "SEASON_POINTS") {
        mocks.seasonListReads += 1;
        return mocks.closedSeasons;
      }
      mocks.monthListReads += 1;
      return mocks.closedMonths;
    },
    async listClosedMonthsForUser() {
      return [];
    },
    // O ramo de meses da rota (plan-v9 S03) continua existindo aqui: a resposta sem parâmetro é a
    // que a tela de hoje recebe, com o mês vivo intacto e lista vazia — o ramo de temporada é o
    // acrescentado, não um substituto.
    async findClosedMonth(month, track) {
      return track === "MONTH_POINTS" ? null : null;
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
      users: { async findUserById() { return null; }, async findAllUsers() { return []; } } as never,
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
  mocks.session = { id: 1, email: "vol@lab.com", name: "Voluntario", roles: ["VOLUNTARIO"], status: "active" };
}

function get(url: string) {
  return GET(new NextRequest(url, { method: "GET" }));
}

describe("GET /api/board?year — o quadro de uma temporada", () => {
  beforeEach(() => {
    mocks.session = null;
    mocks.yearReads = [];
    mocks.seasonListReads = 0;
    mocks.monthListReads = 0;
    mocks.closedMonths = [];
    mocks.closedSeasons = [
      { month: "2026", closedAt: new Date("2027-01-01T03:00:00.000Z"), peopleCount: 2 },
      { month: "2027", closedAt: new Date("2028-01-01T03:00:00.000Z"), peopleCount: 2 },
    ];
    mocks.seasonRows = [
      { userId: 2, userName: "Carla Lima", month: "2026", track: "SEASON_POINTS", value: 500, position: 1, periodStart: new Date(), periodEnd: new Date(), closedAt: new Date() },
      { userId: 1, userName: "Bruno Rocha", month: "2026", track: "SEASON_POINTS", value: -20, position: 2, periodStart: new Date(), periodEnd: new Date(), closedAt: new Date() },
    ] as never;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  it("ano fechado devolve as linhas congeladas, com aviso de temporada fechada", async () => {
    login();
    const response = await get("http://localhost/api/board?year=2026");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.year).toBe("2026");
    expect(body.yearLabel).toBe("temporada 2026");
    expect(body.track).toBe("SEASON_POINTS");
    expect(body.closed).toBe(true);
    expect(body.live).toBe(false);
    expect(body.entries).toEqual([
      { userId: 2, name: "Carla Lima", value: 500, position: 1 },
      { userId: 1, name: "Bruno Rocha", value: -20, position: 2 },
    ]);
    expect(body.notice).toMatch(/Temporada fechada: temporada 2026/);
  });

  it("ano em curso pedido por nome responde o acumulado vivo, nunca quadro vazio (R9 espelhada)", async () => {
    login();
    const response = await get("http://localhost/api/board?year=2028");
    const body = await response.json();
    expect(body.live).toBe(true);
    expect(body.closed).toBe(false);
    expect(body.entries).toEqual([]);
    expect(body.notice).toMatch(/em curso/);
    // Nenhuma leitura de histórico acontece no caminho vivo.
    expect(mocks.yearReads).toEqual([]);
  });

  it("ano válido nunca fechado devolve quadro vazio nomeando o ANO pedido, não o ano em curso (CA8 espelhada)", async () => {
    // 2025 é anterior à primeira temporada e é recusado como inválido (teste abaixo). Para o
    // ramo CA8 eu tiro o registro de 2027 e peço 2027: ano válido, nunca fechado.
    mocks.closedSeasons = [{ month: "2026", closedAt: new Date("2027-01-01T03:00:00.000Z"), peopleCount: 2 }];
    login();
    const response = await get("http://localhost/api/board?year=2027");
    const body = await response.json();
    expect(body.year).toBe("2027");
    expect(body.closed).toBe(false);
    expect(body.live).toBe(false);
    expect(body.entries).toEqual([]);
    expect(body.notice).toMatch(/2027/);
    expect(body.notice).not.toMatch(/2028/);
  });

  it("ano malformado responde 400 nomeando o campo", async () => {
    login();
    const response = await get("http://localhost/api/board?year=99");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/year invalido: 99/);
  });

  it("ano anterior à primeira temporada responde 400 nomeando o ano", async () => {
    login();
    const response = await get("http://localhost/api/board?year=2025");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/year invalido: 2025/);
  });

  it("a leitura sem parâmetro declara o ano em curso, as temporadas fechadas e o mês em curso", async () => {
    login();
    const response = await get("http://localhost/api/board");
    const body = await response.json();
    expect(body.seasonYear).toBe("2028");
    // Do mais recente ao mais antigo, como a lista de meses do seletor de hoje.
    expect(body.closedSeasons).toEqual([
      { year: "2026", yearLabel: "temporada 2026" },
      { year: "2027", yearLabel: "temporada 2027" },
    ]);
    expect(body.month).toBe("2028-06");
    expect(body.closedMonths).toEqual([]);
    // A resposta sem parâmetro é a que a tela de hoje recebe, com o mês vivo intacto: a lista de
    // meses vem da porta (contador 1), a de temporadas também (1), e nenhuma leitura de
    // histórico — nem de mês, nem de ano — acontece nesse caminho.
    expect(mocks.monthListReads).toBe(1);
    expect(mocks.seasonListReads).toBe(1);
    expect(mocks.yearReads).toEqual([]);
  });

  it("leitura do autenticado sem gate: um VOLUNTARIO abre temporada fechada", async () => {
    login();
    const response = await get("http://localhost/api/board?year=2026");
    expect(response.status).toBe(200);
  });

  it("sem sessão responde 401 antes de qualquer leitura de temporadas", async () => {
    const response = await get("http://localhost/api/board?year=2026");
    expect(response.status).toBe(401);
    expect(mocks.yearReads).toEqual([]);
    expect(mocks.seasonListReads).toBe(0);
  });
});
