// @vitest-environment node
/**
 * plan-v9 S01 (ADR-001, R2) — o seam de prêmio escreve as duas trilhas.
 *
 * O que este arquivo prova e onde: `awardAndRecord` é o ÚNICO lugar do sistema onde um prêmio
 * creditado toca a pessoa (medição: task, sessão de trabalho e parcela de atividade passam todos
 * por ele). Uma trilha nova entra por aqui, e entra junto com a linha de `history`, no mesmo
 * `$transaction` — não depois dele. Se o incremento do mês caísse fora do tx, existiria um estado
 * em que a pessoa recebeu o prêmio e o placar do mês não sabe.
 *
 * O duplo de Prisma aqui só registra a forma da escrita. O valor real das colunas é provado contra
 * o banco 5433 em `tests/integration/monthly-board-tracks-roundtrip.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const updates: Array<Record<string, unknown>> = [];
  const tx = {
    users: {
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return Promise.resolve({});
      }),
    },
    history: {
      create: vi.fn(() => Promise.resolve({})),
    },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    history: {
      findFirst: vi.fn(() => Promise.resolve(null)),
      create: vi.fn(() => Promise.resolve({})),
    },
  };
  return { updates, tx, prisma, reset: () => { updates.length = 0; } };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: harness.prisma }));

import { createPrismaGamificationAwardHistoryPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-gamification-award-history.port";
import { BOARD_TRACKS } from "@/backend/domain/gamification/board-tracks";

const port = createPrismaGamificationAwardHistoryPort();

describe("S01 — prêmio escreve saldo e placar do mês", () => {
  beforeEach(() => {
    harness.reset();
  });

  it("um crédito produz uma única update com as duas trilhas incrementadas pelo mesmo valor", async () => {
    await port.awardAndRecord({
      userId: 42,
      sourceType: "TASK_COMPLETED",
      sourceId: 7,
      description: "GAMIFICATION:TASK_COMPLETED:7",
      pointsAwarded: 25,
      xpAwarded: 0,
    });

    expect(harness.updates).toHaveLength(1);
    expect(harness.updates[0]).toEqual({
      points: { increment: 25 },
      currentMonthPoints: { increment: 25 },
    });
  });

  it("prêmio negativo (atraso, DEC-39) desconta as duas trilhas com o mesmo valor", async () => {
    await port.awardAndRecord({
      userId: 43,
      sourceType: "TASK_COMPLETED",
      sourceId: 8,
      description: "GAMIFICATION:TASK_COMPLETED:8",
      pointsAwarded: -20,
      xpAwarded: 0,
    });

    expect(harness.updates[0]).toEqual({
      points: { increment: -20 },
      currentMonthPoints: { increment: -20 },
    });
  });

  it("a trilha do placar tem um nome só, e ele vem do domínio (INV6)", () => {
    expect(Object.values(BOARD_TRACKS)).toEqual(["MONTH_POINTS"]);
  });
});
