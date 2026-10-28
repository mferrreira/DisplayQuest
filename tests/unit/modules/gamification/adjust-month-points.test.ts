// @vitest-environment node
/**
 * plan-v9 S05 (ADR-006/DEC-228) — pin do `AdjustMonthPointsUseCase`.
 *
 * O trinômio DEC-60 espelhado para o placar do MÊS: `set` escreve valor absoluto (negativo
 * incluído — a premiação produz placar negativo, DEC-39), `add` tem chão em 0 e `remove`
 * exige suficiência. Cada ajuste vira linha de auditoria (quem/quando/para quem/de→para) na
 * MESMA escrita; a ação é GAMIFICATION_MONTH_ADJUST para não colidir com a dedupe da
 * premiação.
 *
 * O gate é MANAGE_USERS com a mensagem própria (MONTH_ADJUST_DENIED_MESSAGE), e o ator de
 * sistema é RECUSADO com frase própria: o ajuste é ação de gestão com banana `performedBy`
 * (a auditoria precisa de uma pessoa); não há chamador de sistema — `requireActorPermission`
 * deixaria passar pelo bypass declarado do cron (BI6-2b/DEC-54), então o use case mata o ramo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const adapterHarness = vi.hoisted(() => {
  const writes: Array<Record<string, unknown>> = [];
  const state = { currentMonthPoints: 70 };
  const tx = {
    users: {
      findUnique: vi.fn(async () => ({ currentMonthPoints: state.currentMonthPoints })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        state.currentMonthPoints = data.currentMonthPoints as number;
      }),
    },
    history: { create: vi.fn(async () => undefined) },
  };
  return {
    writes,
    state,
    tx,
    prisma: { $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) },
    reset: () => {
      writes.length = 0;
      state.currentMonthPoints = 70;
    },
  };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: adapterHarness.prisma }));

import { createGamificationModule } from "@/backend/modules/gamification";
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port";
import {
  MONTH_ADJUST_DENIED_MESSAGE,
  MONTH_ADJUST_INSUFFICIENT_MESSAGE,
  MONTH_ADJUST_HISTORY_ACTION,
  monthAdjustDescription,
} from "@/backend/domain/gamification";
import { ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain/errors";
import { systemActor, userActor } from "@/backend/domain/identity";
import { isDomainError } from "@/backend/domain";
import { createPrismaGamificationUsersPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-gamification-users.port";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const MANAGER = userActor(77, ["COORDENADOR"]);
const VOLUNTARIO = userActor(78, ["VOLUNTARIO"]);

function makeFakes(seed: { id: number | null; points: number }) {
  const state = {
    ...seed,
    written: null as null | Parameters<GamificationUsersPort["adjustMonthPoints"]>[0],
    readId: undefined as number | undefined,
  };
  const users: GamificationUsersPort = {
    async findProgressionById() {
      throw new Error("porta não deveria ser usada neste teste: findProgressionById");
    },
    async findUserById() {
      throw new Error("porta não deveria ser usada neste teste: findUserById");
    },
    async findAllUsers() {
      throw new Error("porta não deveria ser usada neste teste: findAllUsers");
    },
    async findMonthPointsById(userId) {
      state.readId = userId;
      return state.id === null ? null : { id: state.id, currentMonthPoints: state.points };
    },
    async adjustMonthPoints(data) {
      state.written = data;
    },
  };
  return { state, users };
}

function messageOf(error: unknown): string {
  expect(isDomainError(error)).toBe(true);
  return (error as { message: string }).message;
}

beforeEach(() => {});

describe("AdjustMonthPointsUseCase — ajuste do placar do mês (DEC-228)", () => {
  it("sem MANAGE_USERS a recusa é ForbiddenError com a MESMA frase da rota, e ninguém é lido", async () => {
    const { users } = makeFakes({ id: 3, points: 10 });
    const gamification = createGamificationModule({ ports: { users, awardHistory: unused, badges: unused, userBadges: unused, stats: unused, monthClose: unused } });

    const error = await gamification
      .adjustMonthPoints({ actor: VOLUNTARIO, userId: 3, action: "set", points: 5, now: NOW })
      .catch((e) => e);

    expect(messageOf(error)).toBe(MONTH_ADJUST_DENIED_MESSAGE);
  });

  it("ator de sistema é recusado com frase própria: a auditoria precisa de uma pessoa", async () => {
    const { users, state } = makeFakes({ id: 3, points: 10 });
    const gamification = createGamificationModule({ ports: { users, awardHistory: unused, badges: unused, userBadges: unused, stats: unused, monthClose: unused } });

    const error = await gamification
      .adjustMonthPoints({ actor: systemActor("NIGHTLY_SWEEP" as never), userId: 3, action: "set", points: 5, now: NOW })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(messageOf(error)).toBe("O ajuste do placar do mês precisa de uma pessoa responsável.");
    expect(state.written).toBeNull();
  });

  it("userId inválido recusa nomeando o campo, antes de qualquer leitura", async () => {
    const { users, state } = makeFakes({ id: 3, points: 10 });
    const gamification = createGamificationModule({ ports: { users, awardHistory: unused, badges: unused, userBadges: unused, stats: unused, monthClose: unused } });

    const error = await gamification
      .adjustMonthPoints({ actor: MANAGER, userId: 0, action: "set", points: 5, now: NOW })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(messageOf(error)).toContain("userId");
    expect(state.readId).toBeUndefined();
  });

  it("ação inválida recusa com a frase congelada (Ação inválida), antes da leitura", async () => {
    const { users, state } = makeFakes({ id: 3, points: 10 });
    const gamification = createGamificationModule({ ports: { users, awardHistory: unused, badges: unused, userBadges: unused, stats: unused, monthClose: unused } });

    const error = await gamification
      .adjustMonthPoints({ actor: MANAGER, userId: 3, action: "bogus" as never, points: 5, now: NOW })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(messageOf(error)).toBe("Ação inválida");
    expect(state.readId).toBeUndefined();
  });

  it("pessoa inexistente é NotFoundError (Usuário não encontrado)", async () => {
    const { users, state } = makeFakes({ id: null, points: 0 });
    const gamification = createGamificationModule({ ports: { users, awardHistory: unused, badges: unused, userBadges: unused, stats: unused, monthClose: unused } });

    const error = await gamification
      .adjustMonthPoints({ actor: MANAGER, userId: 999, action: "set", points: 5, now: NOW })
      .catch((e) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect(messageOf(error)).toBe("Usuário não encontrado");
    expect(state.readId).toBe(999);
    expect(state.written).toBeNull();
  });

  it("remove insuficiente recusa com a frase congelada e NÃO escreve nada", async () => {
    const { users, state } = makeFakes({ id: 3, points: 10 });
    const gamification = createGamificationModule({ ports: { users, awardHistory: unused, badges: unused, userBadges: unused, stats: unused, monthClose: unused } });

    const error = await gamification
      .adjustMonthPoints({ actor: MANAGER, userId: 3, action: "remove", points: 11, now: NOW })
      .catch((e) => e);

    expect(messageOf(error)).toBe(MONTH_ADJUST_INSUFFICIENT_MESSAGE);
    expect(state.written).toBeNull();
  });

  it("set escreve o valor absoluto (negativo incluído) e a resposta diz o de→para", async () => {
    const { users, state } = makeFakes({ id: 3, points: 70 });
    const gamification = createGamificationModule({ ports: { users, awardHistory: unused, badges: unused, userBadges: unused, stats: unused, monthClose: unused } });

    const result = await gamification.adjustMonthPoints({ actor: MANAGER, userId: 3, action: "set", points: -15, now: NOW });

    expect(result).toEqual({
      userId: 3,
      month: "2026-10",
      monthLabel: "outubro de 2026",
      action: "set",
      previous: 70,
      current: -15,
    });
    expect(state.written).toMatchObject({
      userId: 3,
      previous: 70,
      next: -15,
      month: "2026-10",
      performedBy: 77,
      description: monthAdjustDescription("2026-10"),
      detail: { action: "set", points: -15, month: "2026-10" },
    });
  });

  it("add com chão em 0: placar negativo somado não passa de zero (Math.max da DEC-60)", async () => {
    const { users, state } = makeFakes({ id: 3, points: -5 });
    const gamification = createGamificationModule({ ports: { users, awardHistory: unused, badges: unused, userBadges: unused, stats: unused, monthClose: unused } });

    const result = await gamification.adjustMonthPoints({ actor: MANAGER, userId: 3, action: "add", points: 3, now: NOW });

    expect(result.current).toBe(0);
    expect(state.written?.next).toBe(0);
  });

  it("add negativo é recusado pelo trinômio (só `set` escreve negativo)", async () => {
    const { users, state } = makeFakes({ id: 3, points: -5 });
    const gamification = createGamificationModule({ ports: { users, awardHistory: unused, badges: unused, userBadges: unused, stats: unused, monthClose: unused } });

    const error = await gamification
      .adjustMonthPoints({ actor: MANAGER, userId: 3, action: "add", points: -1, now: NOW })
      .catch((e) => e);

    expect(messageOf(error)).toBe("Pontos devem ser um número não negativo");
    expect(state.written).toBeNull();
  });

  it("a auditoria guarda o trinômio no metadata e a ação própria (não GAMIFICATION_AWARD)", async () => {
    const { users, state } = makeFakes({ id: 3, points: 40 });
    const gamification = createGamificationModule({ ports: { users, awardHistory: unused, badges: unused, userBadges: unused, stats: unused, monthClose: unused } });

    await gamification.adjustMonthPoints({ actor: MANAGER, userId: 3, action: "remove", points: 15, now: NOW });

    expect(state.written?.description).toBe("GAMIFICATION:MONTH_POINTS_ADJUST:2026-10");
    expect(state.written?.detail).toEqual({ action: "remove", points: 15, month: "2026-10" });
    expect(MONTH_ADJUST_HISTORY_ACTION).not.toBe("GAMIFICATION_AWARD");
  });
});

describe("S11 — o adaptador de ajuste não toca no saldo", () => {
  beforeEach(() => adapterHarness.reset());

  it("ajusta apenas currentMonthPoints e mantém os campos da auditoria", async () => {
    const port = createPrismaGamificationUsersPort();
    await port.adjustMonthPoints({
      userId: 3,
      previous: 70,
      next: 55,
      month: "2026-10",
      performedBy: 77,
      description: "GAMIFICATION:MONTH_POINTS_ADJUST:2026-10",
      detail: { action: "set", points: 55, month: "2026-10" },
    });

    expect(adapterHarness.writes).toEqual([{ currentMonthPoints: 55 }]);
    expect(adapterHarness.writes[0]).not.toHaveProperty("points");
    expect(adapterHarness.tx.history.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: MONTH_ADJUST_HISTORY_ACTION,
          performedBy: 77,
          oldValues: { currentMonthPoints: 70 },
          newValues: { currentMonthPoints: 55 },
        }),
      }),
    );
  });
});

/** Porta que lança alto se o teste tocar nela — nenhum ramo destes caminhos deve chegar lá. */
const unused = new Proxy({}, { get: () => { throw new Error("porta não deveria ser usada neste teste"); } }) as never;
