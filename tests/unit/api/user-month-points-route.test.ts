// @vitest-environment node
/**
 * plan-v9 S05 (ADR-006/DEC-228) — pin da rota PATCH /api/users/[id]/month-points.
 *
 * O que este arquivo congela, na ORDEM que o B6-7 mediu nas rotas de usuário:
 *
 *   1. 401 sem sessão (requireApiActor).
 *   2. 403 com a frase própria ANTES de qualquer leitura do corpo (B6-7): um VOLUNTARIO com
 *      corpo inválido leva 403 e NÃO o 400 da entrada — o assert de gestão corre antes do parse,
 *      e a frase é a MESMA do use case (MONTH_ADJUST_DENIED_MESSAGE, fonte única no domínio).
 *   3. id inválido → 400 "Usuário inválido".
 *   4. AÇÃO antes do NÚMERO (DEC-60): `{action:"bogus", points:null}` → "Ação inválida", e não
 *      a mensagem do número.
 *   5. DEC-84: `points:null` não é numérico — `JSON.stringify(Infinity)` é `null` e
 *      `Number(null)` é 0, então `{action:"set", points:null}` recusa em vez de zerar o placar.
 *   6. 200 devolve o resultado do use case verbatim, e o `performedBy` da auditoria é a sessão.
 *
 * Módulo REAL sobre portas falsas, não duplo de módulo (lição medida do B6-2a: um duplo faz o
 * 403 SUMIR do teste). Os fakes moram DENTRO do factory do `vi.mock` — o factory roda quando a
 * rota importa o composition root, antes das consts do arquivo existirem; objeto fora do
 * factory nasce em TDZ. O relógio é travado (vi.setSystemTime) para o mês derivado ser
 * determinístico — o use case recorta o mês de `now` (DEC-132).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createUserManagementModule } from "@/backend/modules/user-management";
import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createGamificationModule } from "@/backend/modules/gamification";
import type {
  AdjustMonthPointsData,
  GamificationUsersPort,
} from "@/backend/modules/gamification/application/ports/gamification-users.port";
import type { UserRepositoryPort, UserRecord } from "@/backend/modules/user-management/application/ports/user.repository";
import { MONTH_ADJUST_DENIED_MESSAGE } from "@/backend/domain/gamification";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  /** Último payload chegando à porta `adjustMonthPoints` — é o que prova o valor escrito. */
  written: null as null | AdjustMonthPointsData,
  /** Placar lido pela porta; `id: null` = pessoa inexistente. */
  seed: { id: 3, points: 70 } as { id: number | null; points: number },
  /** Porta que lança alto se qualquer ramo tocar nela — nenhum caminho da rota usa estas. */
  unused: () =>
    new Proxy(
      {},
      {
        get: () => {
          throw new Error("porta não deveria ser usada neste teste");
        },
      },
    ) as never,
}));

vi.mock("@/backend/composition/root", () => {
  const boom = (name: string) => async () => {
    throw new Error(`porta não deveria ser usada neste teste: ${name}`);
  };

  const users: GamificationUsersPort = {
    findProgressionById: boom("users.findProgressionById"),
    findUserById: boom("users.findUserById"),
    findAllUsers: boom("users.findAllUsers"),
    async findMonthPointsById(userId) {
      return mocks.seed.id === userId ? { id: userId, currentMonthPoints: mocks.seed.points } : null;
    },
    async adjustMonthPoints(data) {
      mocks.written = data;
    },
  };

  const repository = mocks.unused() as UserRepositoryPort;
  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      userManagement: createUserManagementModule({
        repository: repository,
      }),
      gamification: createGamificationModule({
        ports: { users, awardHistory: mocks.unused(), badges: mocks.unused(), userBadges: mocks.unused(), stats: mocks.unused(), monthClose: mocks.unused() },
      }),
    }),
  };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { PATCH } from "@/app/api/users/[id]/month-points/route";

/** Array porque `requireApiActor` normaliza com `normalizeRoles`: string solta vira `[]`. */
function login(roles: string[]) {
  mocks.session = { id: 99, email: "gerente@lab.com", name: "Gerente", roles, status: "active" };
}

function patch(body: unknown, id: string = "3") {
  return PATCH(new NextRequest(new URL(`/api/users/${id}/month-points`, "http://localhost:3000"), {
    method: "PATCH",
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

const read = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.session = null;
  mocks.written = null;
  mocks.seed = { id: 3, points: 70 };
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
  login(["COORDENADOR"]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PATCH /api/users/[id]/month-points — ajuste do placar do mês (DEC-228)", () => {
  it("sem sessão: 401", async () => {
    mocks.session = null;
    const response = await patch({ action: "set", points: 5 });
    expect(response.status).toBe(401);
    expect((await read(response)).error).toBe("Não autorizado");
  });

  it("sem MANAGE_USERS: 403 com a frase própria MESMO com corpo inválido (gate antes do parse, B6-7)", async () => {
    login(["VOLUNTARIO"]);
    const response = await patch({ action: "bogus", points: null });
    expect(response.status).toBe(403);
    expect((await read(response)).error).toBe(MONTH_ADJUST_DENIED_MESSAGE);
    expect(mocks.written).toBeNull();
  });

  it("id não numérico: 400 Usuário inválido, DEPOIS do gate", async () => {
    const response = await patch({ action: "set", points: 5 }, "abc");
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Usuário inválido");
    expect(mocks.written).toBeNull();
  });

  it("ação antes do número: `bogus` com `points:null` recusa a AÇÃO, não o número (DEC-60)", async () => {
    const response = await patch({ action: "bogus", points: null });
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Ação inválida");
    expect(mocks.written).toBeNull();
  });

  it("DEC-84: `points:null` não é numérico — o set com null é recusado, não lido como 0", async () => {
    const response = await patch({ action: "set", points: null });
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Pontos devem ser um número não negativo");
    expect(mocks.written).toBeNull();
  });

  it("número em string vale 12: é o último valor bruto do DEC-84 (alguns clientes mandam string)", async () => {
    const response = await patch({ action: "set", points: "12" });
    expect(response.status).toBe(200);
    expect(await read(response)).toMatchObject({ action: "set", previous: 70, current: 12 });
    expect(mocks.written?.next).toBe(12);
  });

  it("200 devolve o de→para verbatim e a auditoria aponta a sessão (performedBy 99)", async () => {
    const response = await patch({ action: "set", points: -15 });
    expect(response.status).toBe(200);
    expect(await read(response)).toEqual({
      userId: 3,
      month: "2026-10",
      monthLabel: "outubro de 2026",
      action: "set",
      previous: 70,
      current: -15,
    });
    expect(mocks.written).toMatchObject({
      userId: 3,
      previous: 70,
      next: -15,
      month: "2026-10",
      performedBy: 99,
      description: "GAMIFICATION:MONTH_POINTS_ADJUST:2026-10",
      detail: { action: "set", points: -15, month: "2026-10" },
    });
  });

  it("add com chão em 0 atravessa a rota com a mesma régua (DEC-60 espelhado)", async () => {
    mocks.seed = { id: 3, points: -5 };
    const response = await patch({ action: "add", points: 3 });
    expect(response.status).toBe(200);
    expect((await read(response)).current).toBe(0);
    expect(mocks.written?.next).toBe(0);
  });
});
