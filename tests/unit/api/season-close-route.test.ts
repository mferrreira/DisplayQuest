// @vitest-environment node
/**
 * plan-v20 S01 (DEC-254; CA9 do fechamento de mês, mesmo desenho) —
 * `POST /api/board/season-close`.
 *
 * O módulo é REAL sobre uma porta falsa, como `monthly-board-close-route.test.ts`: dobrar o
 * módulo faria o 403 ser o 403 do duplo, não do sistema. A autoridade (`MANAGE_USERS`) decide
 * dentro do `CloseSeasonUseCase`, e o que se prova é a ordem: gate antes de ler gente e antes
 * de escrever qualquer coisa. Relógio congelado em 1 de janeiro de 2027 às 00:00 (Sao Paulo),
 * para o ano fechado ser sempre 2026.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createGamificationModule } from "@/backend/modules/gamification";
import { SEASON_CLOSE_DENIED_MESSAGE } from "@/backend/modules/gamification/application/use-cases/close-season.use-case";
import type {
  BoardMonthClosePort,
  SeasonCloseWrite,
} from "@/backend/modules/gamification/application/ports/board-month-close.port";
import type { SeasonClosePerson } from "@/backend/domain/gamification/season-close-rules";

const RUN_INSTANT = "2027-01-01T03:00:00.000Z"; // 00:00 de 1 de janeiro de 2027, Sao Paulo

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  people: [] as SeasonClosePerson[],
  closedMarker: null as null | { closedAt: Date },
  writes: [] as SeasonCloseWrite[],
  seasonReads: 0,
}));

vi.mock("@/backend/composition/root", () => {
  const monthClose: BoardMonthClosePort = {
    async findClosedMonth(month, track) {
      return mocks.closedMarker ? { month, closedAt: mocks.closedMarker.closedAt } : null;
    },
    async listPeopleForClose() {
      throw new Error("leitura do placar do mês não deveria acontecer no fechamento de temporada");
    },
    async listPeopleForSeasonClose() {
      mocks.seasonReads += 1;
      return mocks.people;
    },
    async writeClose(input) {
      mocks.writes.push(input);
    },
    async readClosedMonth() {
      throw new Error("leitura de fechado não deveria acontecer no fechamento");
    },
    async listClosedMonths() {
      throw new Error("lista de fechados não deveria acontecer no fechamento");
    },
    async listClosedMonthsForUser() {
      throw new Error("lista de linhas de pessoa não deveria acontecer no fechamento");
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

  // plan-v15 S11 (R4): depois da escrita, o fechamento roda evaluate sobre cada linha. Os
  // duplos fazem o evaluate devolver [] — este teste prova o fechamento, não a premiação.
  const evaluateUsers = {
    async findUserById(id: number) {
      const person = mocks.people.find((p) => p.id === id);
      return person ? { id: person.id, name: person.name, points: 0, completedTasks: 0 } : null;
    },
    async findAllUsers() {
      return mocks.people.map((p) => ({ id: p.id, points: p.currentSeasonPoints, completedTasks: 0, status: p.status }));
    },
  } as never;
  const evaluateBadges = { async findActive() { return []; } } as never;

  const realGamification = createGamificationModule({
    ports: { monthClose, users: evaluateUsers, badges: evaluateBadges, awardHistory: unused, userBadges: unused, stats: unused, metrics: unused, passives: unused },
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

import { POST } from "@/app/api/board/season-close/route";

const MANAGER_ROLES = [["COORDENADOR"], ["GERENTE"]];
const NO_MANAGEMENT_ROLES = [["VOLUNTARIO"], ["GERENTE_PROJETO"], ["LABORATORISTA"]];

function login(roles: string[], id = 42) {
  mocks.session = { id, email: "gestor@lab.com", name: "Gestor", roles, status: "active" };
}

function seasonPeople(): SeasonClosePerson[] {
  return [
    { id: 1, name: "Alice", status: "active", currentSeasonPoints: 50 },
    { id: 2, name: "Bruno", status: "active", currentSeasonPoints: 100 },
    { id: 3, name: "Carla", status: "suspended", currentSeasonPoints: 90 },
  ];
}

describe("POST /api/board/season-close — rota de gestão da temporada", () => {
  beforeEach(() => {
    mocks.session = null;
    mocks.people = seasonPeople();
    mocks.closedMarker = null;
    mocks.writes = [];
    mocks.seasonReads = 0;
    vi.useRealTimers();
    vi.setSystemTime(new Date(RUN_INSTANT));
  });

  it("sem sessão responde 401 antes de qualquer leitura", async () => {
    const response = await POST(new NextRequest("http://localhost/api/board/season-close", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(mocks.seasonReads).toBe(0);
    expect(mocks.writes).toEqual([]);
  });

  it("papel sem MANAGE_USERS recebe 403 com a frase congelada, e nada foi lido nem escrito", async () => {
    for (const roles of NO_MANAGEMENT_ROLES) {
      login(roles);
      const response = await POST(new NextRequest("http://localhost/api/board/season-close", { method: "POST" }));
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe(SEASON_CLOSE_DENIED_MESSAGE);
    }
    expect(mocks.seasonReads).toBe(0);
    expect(mocks.writes).toEqual([]);
  });

  it("COORDENADOR fecha a temporada 2026, com as linhas e os dois zeros no mesmo writeClose", async () => {
    login(["COORDENADOR"]);
    const response = await POST(new NextRequest("http://localhost/api/board/season-close", { method: "POST" }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.year).toBe("2026");
    expect(body.track).toBe("SEASON_POINTS");
    expect(body.closed).toBe(true);
    expect(body.alreadyClosed).toBe(false);
    expect(body.peopleCount).toBe(2);
    expect(body.excluded).toEqual([{ userId: 3, status: "suspended" }]);
    expect(body.triggeredBy).toBe("USER:42");
    expect(body.periodStart).toBe("2026-01-01T03:00:00.000Z");
    expect(body.periodEnd).toBe("2027-01-01T02:59:59.999Z");

    expect(mocks.writes).toHaveLength(1);
    const write = mocks.writes[0];
    expect(write.month).toBe("2026");
    expect(write.track).toBe("SEASON_POINTS");
    expect(write.rows.map((r) => [r.userId, r.value, r.position])).toEqual([
      [2, 100, 1],
      [1, 50, 2],
    ]);
    expect(write.zeroFields.sort()).toEqual(["balance", "monthPoints"]);
    expect(write.userIdsToZero.sort()).toEqual([1, 2, 3]);
  });

  it("temporada já fechada devolve alreadyClosed, sem escrever", async () => {
    mocks.closedMarker = { closedAt: new Date("2027-01-01T04:00:00.000Z") };
    login(["GERENTE"]);
    const response = await POST(new NextRequest("http://localhost/api/board/season-close", { method: "POST" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.closed).toBe(false);
    expect(body.alreadyClosed).toBe(true);
    expect(mocks.writes).toEqual([]);
  });

  it("ano anterior à primeira temporada responde 400 nomeando o ano, sem escrever", async () => {
    vi.setSystemTime(new Date("2026-01-01T03:00:00.000Z"));
    login(["COORDENADOR"]);
    const response = await POST(new NextRequest("http://localhost/api/board/season-close", { method: "POST" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/2025/);
    // A base é lida depois do lookup de idempotência; o que não acontece é o commit.
    expect(mocks.writes).toEqual([]);
  });
});
