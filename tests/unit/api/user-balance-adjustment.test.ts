// @vitest-environment node
/**
 * plan-v8 V8-5 (DEC-60 + DEC-222 + ASK-V8-24) — o ajuste manual do painel sobre as DUAS trilhas
 * de saldo, na rota.
 *
 * Este arquivo congela as duas coisas que a rota decide, e nada mais:
 *   - a ordem medida do V4-6 (DEC-60/DEC-84): gate → id → AÇÃO → trilha → número. Para saber se o
 *     número pode ser negativo a rota precisa conhecer ação E trilha antes; um corpo com número
 *     inválido e ação inválida denuncia a AÇÃO, não o número;
 *   - a assimetria entre as trilhas: `set` aceita negativo na trilha PONTOS (DEC-60 — a premiação
 *     produz total negativo, DEC-39; medido na instância: Coordenador −20, Gerente −31030) e
 *     recusa na trilha MOEDA (DEC-222: nenhuma fonte produz moeda negativa — o prêmio tem piso 0,
 *     DEC-74 — e moeda negativa seria debito de loja).
 *
 * A aritmética em si não é daqui: ela é a regra pura
 * (`tests/unit/domain/gamification/track-adjustment.test.ts`) e o livro-caixa é o roundtrip
 * (`tests/integration/balance-adjustment-roundtrip.test.ts`, contra o banco real na 5433). O
 * ledger falso deste arquivo chama a MESMA função do domínio que o adaptador Prisma chama —
 * reimplementar a regra aqui é o modo de falha da DEC-90 (duplo verde com a produção mentindo).
 *
 * Módulo REAL sobre portas falsas, não duplo de módulo (a lição medida do B6-2a: duplo de módulo
 * faz a recusa SUMIR do teste em vez de falhar).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { COINS_GAMIFICATION_TRACK, POINTS_GAMIFICATION_TRACK, applyTrackAdjustment } from "@/backend/domain";
import { createUserManagementModule } from "@/backend/modules/user-management";
import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import type { TrackAdjustmentLedgerPort } from "@/backend/modules/user-management/application/ports/track-adjustment-ledger.port";
import type { UserRepositoryPort, UserRecord } from "@/backend/modules/user-management/application/ports/user.repository";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  /** Incrementado no beforeEach: força o store do mock a voltar à semente (o mock é por módulo). */
  seedVersion: 0,
  /** O último ajuste que chegou ao ledger — prova a trilha, a ação e o número entregues. */
  adjustments: [] as Array<{
    userId: number;
    actorId: number;
    track: string;
    action: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
  }>,
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
      coins: 0,
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
  let seededVersion = 0;
  /** O store é do módulo mockado, não do teste: re-semeia quando o beforeEach incrementa a versão. */
  const fresh = () => {
    if (seededVersion !== mocks.seedVersion) {
      seededVersion = mocks.seedVersion;
      store = seed();
    }
    return store;
  };
  const boom = (name: string) => async () => {
    throw new Error(`porta não deveria ser usada neste teste: ${name}`);
  };

  const repository: UserRepositoryPort = {
    findById: async (id) => (id === 2 ? fresh() : null),
    // O ajuste de saldo não passa por aqui na V8-5: quem escreve a coluna é o ledger, dentro da
    // transação. `update` continua existindo porque o mock de porta é o registro inteiro.
    update: async (user) => {
      store = { ...store, ...user } as UserRecord;
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

  const ledger: TrackAdjustmentLedgerPort = {
    async adjust({ userId, actorId, track, action, amount }) {
      if (userId !== 2) return { applied: false as const, reason: "usuario-ausente" as const };
      fresh();
      const before = track === COINS_GAMIFICATION_TRACK ? store.coins ?? 0 : store.points;
      // A MESMA regra que o adaptador Prisma aplica dentro do $transaction.
      const after = applyTrackAdjustment(track, action, amount, before);
      store = { ...store, [track === COINS_GAMIFICATION_TRACK ? "coins" : "points"]: after } as UserRecord;
      mocks.adjustments.push({ userId, actorId, track, action, amount, balanceBefore: before, balanceAfter: after });
      return { applied: true as const, track, balanceBefore: before, balanceAfter: after };
    },
  };

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      userManagement: createUserManagementModule({ repository, trackAdjustment: ledger }),
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
  mocks.adjustments = [];
  mocks.seedVersion += 1;
  login(["COORDENADOR"]);
});

describe("PATCH /api/users/[id]/points — trilha PONTOS: `set` aceita negativo (DEC-60)", () => {
  it("set negativo escreve o negativo: 200, e a trilha e o valor chegam ao ledger", async () => {
    const response = await patch({ action: "set", track: "POINTS", amount: -20 });
    expect(response.status).toBe(200);
    expect((await read(response)).user.points).toBe(-20);
    expect(mocks.adjustments).toEqual([
      { userId: 2, actorId: 99, track: POINTS_GAMIFICATION_TRACK, action: "set", amount: -20, balanceBefore: 0, balanceAfter: -20 },
    ]);
  });

  it("trilha ausente é a trilha histórica: POINTS (o cliente antigo não mudou de caminho)", async () => {
    const response = await patch({ action: "set", amount: -31030 });
    expect(response.status).toBe(200);
    expect((await read(response)).user.points).toBe(-31030);
    expect(mocks.adjustments[0].track).toBe(POINTS_GAMIFICATION_TRACK);
  });

  it("set negativo a partir de zero não é barrado por o usuário 'não ter' pontos", async () => {
    // `remove` exige suficiência; `set` não tem nada a ver com suficiência — é valor absoluto.
    expect((await patch({ action: "set", track: "POINTS", amount: -31030 })).status).toBe(200);
  });

  it("add continua com chão em 0 e continua recusando entrada negativa na rota", async () => {
    const response = await patch({ action: "add", track: "POINTS", amount: -1 });
    expect(response.status).toBe(400);
    // Mensagem preservada de propósito: é o texto congelado do V4-6, agora nomeando a trilha.
    expect((await read(response)).error).toBe("Pontos devem ser um número não negativo");
  });

  it("remove continua recusando entrada negativa", async () => {
    const response = await patch({ action: "remove", track: "POINTS", amount: -1 });
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Pontos devem ser um número não negativo");
  });

  it("precedência medida: ação inválida com número negativo denuncia a AÇÃO, não o número", async () => {
    const response = await patch({ action: "bogus", track: "POINTS", amount: -5 });
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Ação inválida");
  });

  it("ASK-V4-06 corrigido (DEC-84): `amount: null` é recusado, não lido como 0", async () => {
    // JSON não tem `Infinity`: `JSON.stringify(Infinity)` devolve `null`, e `Number(null)` é 0.
    const response = await patch({ action: "set", track: "POINTS", amount: null });
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Pontos devem ser um número não negativo");
    expect(mocks.adjustments).toEqual([]);
  });

  it("ASK-V4-06: `undefined`, string vazia e booleano também são recusados — Number('') é 0", async () => {
    for (const amount of [undefined, "", true, {}, []]) {
      expect((await patch({ action: "set", track: "POINTS", amount })).status).toBe(400);
      expect(mocks.adjustments).toEqual([]);
    }
  });

  it("número em string continua aceito (é o que alguns clientes mandam): \"12\" vale 12", async () => {
    const response = await patch({ action: "set", track: "POINTS", amount: "12" });
    expect(response.status).toBe(200);
    expect((await read(response)).user.points).toBe(12);
  });
});

describe("PATCH /api/users/[id]/points — trilha MOEDA: as três ações, sem saldo negativo (DEC-222)", () => {
  it("set/add/remove de moeda escrevem na moeda e não tocam o placar do mês", async () => {
    const added = await patch({ action: "add", track: "COINS", amount: 300 });
    expect(added.status).toBe(200);
    const body = await read(added);
    expect(body.user.coins).toBe(300);
    expect(body.user.points).toBe(0);
    expect(mocks.adjustments[0]).toMatchObject({
      track: COINS_GAMIFICATION_TRACK,
      action: "add",
      amount: 300,
      balanceBefore: 0,
      balanceAfter: 300,
    });

    const removed = await patch({ action: "remove", track: "COINS", amount: 100 });
    expect((await read(removed)).user.coins).toBe(200);
    // A prova de que o ajuste de moeda não moveu o placar: remover 1 ponto de um placar intacto em
    // zero continua recusando por suficiência na frase da trilha pontos.
    const pointsUntouched = await patch({ action: "remove", track: "POINTS", amount: 1 });
    expect(pointsUntouched.status).toBe(400);
    expect((await read(pointsUntouched)).error).toBe("Usuário não possui pontos suficientes");

    const setResponse = await patch({ action: "set", track: "COINS", amount: 50 });
    const afterSet = await read(setResponse);
    expect(afterSet.user.coins).toBe(50);
    expect(afterSet.user.points).toBe(0);
  });

  it("`set` de moeda negativa é recusado — a assimetria com a trilha pontos (DEC-222)", async () => {
    const response = await patch({ action: "set", track: "COINS", amount: -20 });
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Moedas devem ser um número não negativo");
    expect(mocks.adjustments).toEqual([]);
  });

  it("`remove` acima do saldo responde com a frase da moeda, não a dos pontos", async () => {
    await patch({ action: "set", track: "COINS", amount: 10 });
    const response = await patch({ action: "remove", track: "COINS", amount: 999 });
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Usuário não possui moedas suficientes");
  });

  it("trilha inválida é recusada nomeando as duas, e o ajuste não acontece", async () => {
    const response = await patch({ action: "set", track: "xp", amount: 5 });
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Trilha inválida: use POINTS ou COINS");
    expect(mocks.adjustments).toEqual([]);
  });
});

describe("PATCH /api/users/[id]/points — gate e ordem", () => {
  it("quem não tem MANAGE_USERS leva 403 antes de qualquer 400", async () => {
    login(["VOLUNTARIO"]);
    const response = await patch({ action: "set", track: "COINS", amount: -20 });
    expect(response.status).toBe(403);
    expect(mocks.adjustments).toEqual([]);
  });

  it("id inválido é 400 depois do gate e antes da ação", async () => {
    login(["VOLUNTARIO"]);
    expect((await PATCH(new NextRequest(new URL("/api/users/abc/points", "http://localhost:3000"), {
      method: "PATCH",
      body: JSON.stringify({ action: "bogus" }),
    }), { params: Promise.resolve({ id: "abc" }) })).status).toBe(403);
  });

  it("ajuste em usuário que não existe é 404", async () => {
    const response = PATCH(new NextRequest(new URL("/api/users/77/points", "http://localhost:3000"), {
      method: "PATCH",
      body: JSON.stringify({ action: "set", track: "COINS", amount: 5 }),
    }), { params: Promise.resolve({ id: "77" }) });
    expect((await response).status).toBe(404);
  });
});
