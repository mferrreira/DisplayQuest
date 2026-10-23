// @vitest-environment node
/**
 * plan-v8 V8-7 (DEC-220) — as três leituras novas do engajamento + o GET da prateleira.
 *
 *   GET /api/gamification/ranking           quadro do mês em curso
 *   GET /api/gamification/season-book       livro-caixa do último ano fechado
 *   GET /api/users/[id]/gamification/history meses e temporadas da pessoa
 *   GET /api/users/[id]/trophies            conquistas com catálogo e estado de equip
 *
 * O que é congelado aqui é o CONTRATO HTTP: sessão exigida (401 antes de qualquer port), `id` inválido
 * (400 "Usuário inválido") antes de qualquer port, o shape do sucesso, e — o ponto da onda — que estas
 * leituras são ABERTAS ao autenticado: um VOLUNTARIO lê o histórico e a prateleira de OUTRA pessoa com
 * 200, do mesmo modo que `GET /api/user-badges` é aberto desde a decisão do dono em 2026-10-07
 * (DEC-115). A rota vizinha `GET /api/users/[id]/gamification` continua self-ou-gestão (fixada em
 * `user-badges-authorization.test.ts`): o que é vivo é restrito, o que é livro é aberto.
 *
 * Módulo REAL sobre portas falsas (a lição medida do B6-2a: duplo de módulo faz a recusa sumir). A
 * ordem e o desempate da régua são do use case (`monthly-ranking.test.ts`); o que sai do banco fica no
 * roundtrip (`monthly-ranking-roundtrip`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createGamificationModule } from "@/backend/modules/gamification";
import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port";
import type {
  MonthHistoryRow,
  MonthlyPointsCyclePort,
} from "@/backend/modules/gamification/application/ports/monthly-points-cycle.port";
import type {
  MonthlyRankingPort,
  MonthlyRankingRow,
} from "@/backend/modules/gamification/application/ports/monthly-ranking.port";
import type {
  SeasonCyclePort,
  SeasonHistoryRow,
} from "@/backend/modules/gamification/application/ports/season-cycle.port";
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port";

const SELF_ID = 2;
const OTHER_ID = 3;
const CLOSED_YEAR = 2025;

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  rankingRows: [] as MonthlyRankingRow[],
  standings: [] as Array<{ userId: number; name: string; points: number; completedTasks: number; xp: number; elo: string | null; position: number | null }>,
  latestYear: null as number | null,
  seasonHistory: [] as SeasonHistoryRow[],
  monthHistory: [] as MonthHistoryRow[],
  owned: [] as Array<{ id: number; userId: number; badgeId: number; equipped: boolean; earnedAt: Date; earnedBy: number | null }>,
  catalog: [] as Array<Record<string, unknown>>,
  /** Port chamada por nome — prova que 401/400 não leram nada. */
  calls: [] as string[],
}));

vi.mock("@/backend/composition/root", () => {
  const boom = (name: string) => async () => {
    throw new Error(`porta de gamification não deveria ser usada nesta leitura: ${name}`);
  };
  const track = (name: string) => {
    mocks.calls.push(name);
  };

  const monthlyRanking: MonthlyRankingPort = {
    async listRows() {
      track("monthlyRanking.listRows");
      return mocks.rankingRows.map((row) => ({ ...row }));
    },
  };

  const seasonCycle = {
    async latestClosedSeasonYear() {
      track("seasonCycle.latestClosedSeasonYear");
      return mocks.latestYear;
    },
    async listSeasonStandings() {
      track("seasonCycle.listSeasonStandings");
      return mocks.standings.map((row) => ({ ...row }));
    },
    async listSeasonHistoryForUser() {
      track("seasonCycle.listSeasonHistoryForUser");
      return mocks.seasonHistory.map((row) => ({ ...row }));
    },
    listCandidatesForSeasonClose: boom("seasonCycle.listCandidatesForSeasonClose"),
    getSeasonSnapshot: boom("seasonCycle.getSeasonSnapshot"),
    closeSeason: boom("seasonCycle.closeSeason"),
  } as unknown as SeasonCyclePort;

  const monthlyCycle = {
    async listMonthHistory() {
      track("monthlyCycle.listMonthHistory");
      return mocks.monthHistory.map((row) => ({ ...row }));
    },
    listAllUsersForClose: boom("monthlyCycle.listAllUsersForClose"),
    countTasksCompletedInMonth: boom("monthlyCycle.countTasksCompletedInMonth"),
    hasMonthSnapshot: boom("monthlyCycle.hasMonthSnapshot"),
    closeMonth: boom("monthlyCycle.closeMonth"),
  } as unknown as MonthlyPointsCyclePort;

  const userBadges = {
    async findByUserId() {
      track("userBadges.findByUserId");
      return mocks.owned.map((row) => ({ ...row }));
    },
    findRecentByUserId: boom("userBadges.findRecentByUserId"),
    findByUserAndBadge: boom("userBadges.findByUserAndBadge"),
    create: boom("userBadges.create"),
    delete: boom("userBadges.delete"),
    countEquipped: boom("userBadges.countEquipped"),
    findEquippedEffectsByUserId: boom("userBadges.findEquippedEffectsByUserId"),
    setEquipped: boom("userBadges.setEquipped"),
  } as unknown as UserBadgePort;

  const badges = {
    async findAll() {
      track("badges.findAll");
      return mocks.catalog.map((row) => ({ ...row })) as never;
    },
    findById: boom("badges.findById"),
    findActive: boom("badges.findActive"),
    findByCategory: boom("badges.findByCategory"),
    create: boom("badges.create"),
    update: boom("badges.update"),
    delete: boom("badges.delete"),
  } as unknown as BadgeCatalogPort;

  const gamificationModule = createGamificationModule({
    ports: {
      users: { findProgressionById: boom("users.findProgressionById"), findUserById: boom("users.findUserById"), findAllUsers: boom("users.findAllUsers") },
      awardHistory: boom("awardHistory") as never,
      badges,
      userBadges,
      stats: boom("stats") as never,
      monthlyCycle,
      weeklyXp: boom("weeklyXp") as never,
      seasonCycle,
      seasonChampion: boom("seasonChampion") as never,
      trophyEquip: boom("trophyEquip") as never,
      monthlyRanking,
    },
  });

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      gamification: gamificationModule,
    }),
  };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { GET as readRanking } from "@/app/api/gamification/ranking/route";
import { GET as readSeasonBook } from "@/app/api/gamification/season-book/route";
import { GET as readCycleHistory } from "@/app/api/users/[id]/gamification/history/route";
import { GET as readTrophies } from "@/app/api/users/[id]/trophies/route";

function login(roles: string[], id = SELF_ID) {
  // Array porque `requireApiActor` normaliza com `normalizeRoles`: string solta vira `[]` (B6-2a).
  mocks.session = { id, email: `pessoa-${id}@lab.com`, name: `Pessoa ${id}`, roles, status: "active" };
}

function withId(userId: number | string) {
  return { params: Promise.resolve({ id: String(userId) }) };
}

const read = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.session = null;
  mocks.calls = [];
  mocks.latestYear = CLOSED_YEAR;
  mocks.rankingRows = [
    {
      userId: SELF_ID, name: "Voluntario", avatar: null, bannerKey: null, roles: ["VOLUNTARIO"],
      points: 40, xp: 940, coins: 5, monthTasks: 2, trophiesEquipped: 1, trophiesTotal: 2,
    },
    {
      userId: OTHER_ID, name: "Coordenadora", avatar: null, bannerKey: null, roles: ["COORDENADOR"],
      points: 70, xp: 400, coins: 12, monthTasks: 1, trophiesEquipped: 0, trophiesTotal: 1,
    },
  ];
  mocks.standings = [
    { userId: OTHER_ID, name: "Coordenadora", points: 90, completedTasks: 5, xp: 480, elo: "PRATA", position: 1 },
    { userId: SELF_ID, name: "Voluntario", points: 30, completedTasks: 2, xp: 120, elo: "BRONZE", position: 2 },
  ];
  mocks.seasonHistory = [
    { year: CLOSED_YEAR, points: 90, completedTasks: 5, xp: 480, elo: "PRATA", position: 1 },
  ];
  mocks.monthHistory = [
    { month: "2026-09", points: 60, completedTasks: 3 },
    { month: "2026-08", points: -25, completedTasks: 1 },
  ];
  mocks.owned = [
    { id: 5, userId: OTHER_ID, badgeId: 22, equipped: true, earnedAt: new Date("2026-01-01T03:05:00.000Z"), earnedBy: null },
    { id: 4, userId: OTHER_ID, badgeId: 21, equipped: false, earnedAt: new Date("2025-12-20T12:00:00.000Z"), earnedBy: null },
  ];
  mocks.catalog = [
    { id: 21, name: "MARCO DE 100 TAREFAS", description: "100 tarefas concluídas", category: "milestone", isActive: true, createdBy: 1 },
    { id: 22, name: "CAMPEÃO", description: "Fechou o ano em primeiro", category: "special", isActive: true, createdBy: 1, effects: [{ verb: "pontos_tarefa", tier: "Tier2" }] },
  ];
  login(["VOLUNTARIO"]);
});

describe("GET /api/gamification/ranking", () => {
  it("exige sessão antes de qualquer port", async () => {
    mocks.session = null;
    const response = await readRanking();
    expect(response.status).toBe(401);
    expect(mocks.calls).toEqual([]);
  });

  it("qualquer papel autenticado vê o quadro do mês, já na ordem da régua", async () => {
    const response = await readRanking();
    expect(response.status).toBe(200);

    const body = await read(response);
    expect(body.ranking.month).toMatch(/^\d{4}-\d{2}$/);
    expect(body.ranking.rows.map((row: { name: string }) => row.name)).toEqual(["Coordenadora", "Voluntario"]);
    expect(body.ranking.rows.map((row: { position: number }) => row.position)).toEqual([1, 2]);
    // Tarefas do MÊS, troféus equipados/total e moedas vêm como a port devolveu; elo é derivado do XP.
    expect(body.ranking.rows.map((row: { monthTasks: number }) => row.monthTasks)).toEqual([1, 2]);
    expect(body.ranking.rows.map((row: { elo: string }) => row.elo)).toEqual(["PRATA", "OURO"]);
    expect(body.ranking.rows[0].trophiesEquipped).toBe(0);
    expect(body.ranking.rows[1].trophiesTotal).toBe(2);
    expect(body.ranking.rows[0].coins).toBe(12);
  });
});

describe("GET /api/gamification/season-book", () => {
  it("exige sessão antes de qualquer port", async () => {
    mocks.session = null;
    const response = await readSeasonBook();
    expect(response.status).toBe(401);
    expect(mocks.calls).toEqual([]);
  });

  it("devolve o último ano fechado com posição e elo como foram escritos", async () => {
    const response = await readSeasonBook();
    expect(response.status).toBe(200);

    const body = await read(response);
    expect(body.ledger.year).toBe(CLOSED_YEAR);
    expect(body.ledger.standings.map((row: { position: number | null }) => row.position)).toEqual([1, 2]);
    expect(body.ledger.standings.map((row: { elo: string | null }) => row.elo)).toEqual(["PRATA", "BRONZE"]);
  });

  it("sem temporada fechada, o livro é null e nenhuma posição é pedida", async () => {
    mocks.latestYear = null;
    const response = await readSeasonBook();
    expect(response.status).toBe(200);

    const body = await read(response);
    expect(body.ledger).toEqual({ year: null, standings: [] });
    expect(mocks.calls).toEqual(["seasonCycle.latestClosedSeasonYear"]);
  });
});

describe("GET /api/users/[id]/gamification/history — leitura aberta", () => {
  it("exige sessão antes de qualquer port", async () => {
    mocks.session = null;
    const response = await readCycleHistory(new Request("http://localhost:3000/api/users/3/gamification/history"), withId(OTHER_ID));
    expect(response.status).toBe(401);
    expect(mocks.calls).toEqual([]);
  });

  it("id inválido é 400 com a grafia da rota vizinha, sem tocar nas duas tabelas", async () => {
    for (const id of ["abc", "-3", "0", "1.5", ""]) {
      const response = await readCycleHistory(new Request("http://localhost:3000/api/users/x/gamification/history"), withId(id));
      expect(response.status).toBe(400);
      expect((await read(response)).error).toBe("Usuário inválido");
    }
    expect(mocks.calls).toEqual([]);
  });

  it("um VOLUNTARIO lê o histórico de OUTRA pessoa: meses, temporadas e os anos de campeão", async () => {
    const response = await readCycleHistory(new Request("http://localhost:3000/api/users/3/gamification/history"), withId(OTHER_ID));
    expect(response.status).toBe(200);

    const body = await read(response);
    expect(body.history.months.map((row: { month: string }) => row.month)).toEqual(["2026-09", "2026-08"]);
    expect(body.history.months[1].points).toBe(-25);
    expect(body.history.seasons).toHaveLength(1);
    // O destaque do perfil vem da posição 1 do livro, não de um nome conferido na tela.
    expect(body.history.championYears).toEqual([CLOSED_YEAR]);
    expect(mocks.calls).toContain("monthlyCycle.listMonthHistory");
    expect(mocks.calls).toContain("seasonCycle.listSeasonHistoryForUser");
  });
});

describe("GET /api/users/[id]/trophies — a prateleira", () => {
  it("exige sessão antes de qualquer port", async () => {
    mocks.session = null;
    const response = await readTrophies(new Request("http://localhost:3000/api/users/3/trophies"), withId(OTHER_ID));
    expect(response.status).toBe(401);
    expect(mocks.calls).toEqual([]);
  });

  it("id inválido é 400 antes de ler conquista ou catálogo", async () => {
    const response = await readTrophies(new Request("http://localhost:3000/api/users/x/trophies"), withId("abc"));
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Usuário inválido");
    expect(mocks.calls).toEqual([]);
  });

  it("a leitura é aberta e devolve a conquista com o nome, o efeito e o estado de equip do catálogo", async () => {
    const response = await readTrophies(new Request("http://localhost:3000/api/users/3/trophies"), withId(OTHER_ID));
    expect(response.status).toBe(200);

    const body = await read(response);
    expect(body.trophies.map((row: { name: string }) => row.name)).toEqual(["CAMPEÃO", "MARCO DE 100 TAREFAS"]);
    expect(body.trophies.map((row: { equipped: boolean }) => row.equipped)).toEqual([true, false]);
    expect(body.trophies[0].effects).toEqual([{ verb: "pontos_tarefa", tier: "Tier2" }]);
    expect(body.trophies[1].effects).toEqual([]);
    // O id da conquista é o que o equip escreve — a tela não precisa adivinhar.
    expect(body.trophies[0].userBadgeId).toBe(5);
  });
});
