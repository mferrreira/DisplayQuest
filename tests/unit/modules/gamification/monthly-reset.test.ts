/**
 * plan-v8 V8-2 (DEC-212) — `ResetMonthlyPointsUseCase` sobre port falsa, sem banco.
 *
 * O que está congelado aqui é a ORQUESTRAÇÃO (as quatro regras do docstring do use case), e cada
 * caso nomeia a sua:
 *   1. mês fechado = mês civil ANTERIOR ao `now` da run (novembro fecha outubro; uma run um segundo
 *      antes de meia-noite de SP ainda fecha setembro);
 *   2. snapshot (pontos + tarefas do mês) e `users.points = 0` acontecem juntos, e o negativo vai
 *      fotografado (DEC-39 sobrevive no histórico) enquanto a coluna recebe 0;
 *   3. audiência AMPLA: suspenso com saldo fecha histórico; saldo 0 sem atividade não ganha linha;
 *   4. idempotência por `(userId, month)` LIDA ANTES de zerar — a segunda run não duplica linha e
 *      NÃO zera o mês em curso (é a diferença com o QUIRK-7C do semanal, que aqui não é modelo);
 *   5. o gate é o do precedente semanal (MANAGE_USERS; `systemActor` bypassa — DEC-54).
 *
 * A port falsa conta tarefas filtrando a JANELA que recebeu, de propósito: se o use case errar o
 * recorte do mês, a contagem erra junto e este arquivo vê.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { ForbiddenError } from "@/backend/domain";
import { systemActor, userActor } from "@/backend/domain/identity";
import type {
  MonthlyPointsCandidate,
  MonthlyPointsCyclePort,
  MonthSnapshotWrite,
  MonthWindowInstants,
} from "@/backend/modules/gamification/application/ports/monthly-points-cycle.port";
import {
  MONTHLY_POINTS_RESET_DENIED_MESSAGE,
  ResetMonthlyPointsUseCase,
} from "@/backend/modules/gamification/application/use-cases/reset-monthly-points.use-case";

interface Completion {
  userId: number;
  completedAt: Date;
}

interface FakeWorld {
  users: MonthlyPointsCandidate[];
  completions: Completion[];
  snapshots: MonthSnapshotWrite[];
  /** "Este mês já fechou para esta pessoa", semeado de propósito para o caso de reexecução. */
  alreadyClosed: Array<{ userId: number; month: string }>;
  closeCalls: number;
  windowAsked: MonthWindowInstants | null;
}

function fakeCycle(world: FakeWorld): MonthlyPointsCyclePort {
  return {
    // Contrato do port: TODOS os usuários, qualquer status. A fake não filtra — filtrar aqui seria
    // a fake decidir a audiência, quando a audiência é regra do domínio.
    listAllUsersForClose: async () => [...world.users],
    countTasksCompletedInMonth: async (userId, window) => {
      world.windowAsked = window;
      return world.completions.filter(
        (c) => c.userId === userId && c.completedAt >= window.start && c.completedAt < window.endExclusive,
      ).length;
    },
    hasMonthSnapshot: async (userId, month) =>
      world.snapshots.some((s) => s.userId === userId && s.month === month) ||
      world.alreadyClosed.some((a) => a.userId === userId && a.month === month),
    closeMonth: async (write) => {
      world.closeCalls += 1;
      if (world.snapshots.some((s) => s.userId === write.userId && s.month === write.month)) return false;
      world.snapshots.push(write);
      const user = world.users.find((u) => u.userId === write.userId)!;
      user.points = 0;
      return true;
    },
  };
}

let world: FakeWorld;

beforeEach(() => {
  world = {
    users: [
      { userId: 1, name: "Ana Com Saldo E Tarefas", points: 830 },
      { userId: 2, name: "Bruno No Vermelho", points: -40 },
      { userId: 3, name: "Carla Sem Nada", points: 0 },
      { userId: 4, name: "Dani Suspensa Com Saldo", points: 90 },
    ],
    completions: [
      { userId: 1, completedAt: new Date("2026-10-05T15:00:00.000Z") },
      { userId: 1, completedAt: new Date("2026-10-31T02:59:59.000Z") }, // 23:59:59 de 31/10 em SP
      { userId: 1, completedAt: new Date("2026-11-01T02:59:59.000Z") }, // ainda 31/10 SP — conta
      { userId: 1, completedAt: new Date("2026-11-01T03:00:00.000Z") }, // 00:00 de 01/11 SP — NÃO
      { userId: 4, completedAt: new Date("2026-10-15T12:00:00.000Z") },
      { userId: 2, completedAt: new Date("2026-09-30T12:00:00.000Z") }, // setembro — fora
    ],
    snapshots: [],
    alreadyClosed: [],
    closeCalls: 0,
    windowAsked: null,
  };
});

const RUN_1_NOVEMBRO = new Date("2026-11-01T03:00:00.000Z"); // 00:00 de 01/11 America/Sao_Paulo

function run(now: Date, actor = systemActor("MONTHLY_POINTS_RESET")) {
  return new ResetMonthlyPointsUseCase({ cycle: fakeCycle(world) }).execute({ actor, now });
}

describe("reset mensal — o mês e a janela", () => {
  it("a run das 00:00 de 1º de novembro fecha OUTUBRO e fotografa as tarefas de outubro", async () => {
    const result = await run(RUN_1_NOVEMBRO);

    expect(result.month).toBe("2026-10");
    // Ana: três conclusões dentro da janela, uma delas às 23:59:59 de 31/10 (SP) e a de 00:00 de
    // 01/11 FORA. A janela é o que separa as duas.
    expect(result.outcomes.find((o) => o.userId === 1)?.completedTasksOfMonth).toBe(3);
    expect(world.windowAsked).toEqual({
      start: new Date("2026-10-01T03:00:00.000Z"),
      endExclusive: new Date("2026-11-01T03:00:00.000Z"),
    });
  });

  it("uma run um segundo antes (ainda 31/10 em SP) fecha SETEMBRO: o `now` é parâmetro, não relógio", async () => {
    const result = await run(new Date("2026-10-31T02:59:59.000Z"));
    expect(result.month).toBe("2026-09");
    // Bruno tem uma conclusão em setembro; Ana nenhuma.
    expect(result.outcomes.find((o) => o.userId === 2)?.completedTasksOfMonth).toBe(1);
    expect(result.outcomes.find((o) => o.userId === 1)?.completedTasksOfMonth).toBe(0);
  });
});

describe("reset mensal — snapshot e zeragem", () => {
  it("saldo e tarefas do mês vão para o snapshot, e a coluna recebe 0", async () => {
    const result = await run(RUN_1_NOVEMBRO);

    expect(world.snapshots).toEqual([
      { userId: 1, month: "2026-10", points: 830, completedTasksOfMonth: 3 },
      { userId: 2, month: "2026-10", points: -40, completedTasksOfMonth: 0 },
      { userId: 4, month: "2026-10", points: 90, completedTasksOfMonth: 1 },
    ]);
    expect(world.users.map((u) => u.points)).toEqual([0, 0, 0, 0]);
    expect(result.closed).toBe(3);
  });

  it("o negativo é guardado no snapshot e perdoado na coluna (Q4 do modelo mensal, DEC-39)", async () => {
    await run(RUN_1_NOVEMBRO);
    const snapshot = world.snapshots.find((s) => s.userId === 2)!;
    expect(snapshot.points).toBe(-40);
    expect(world.users.find((u) => u.userId === 2)!.points).toBe(0);
  });
});

describe("reset mensal — audiência do snapshot", () => {
  it("suspenso com saldo fecha histórico em vez de evaporar (audiência ampla, não `findActiveUsers`)", async () => {
    await run(RUN_1_NOVEMBRO);
    expect(world.snapshots.some((s) => s.userId === 4 && s.month === "2026-10")).toBe(true);
  });

  it("saldo 0 e nenhuma tarefa no mês: sem linha, e a coluna nem é tocada", async () => {
    const result = await run(RUN_1_NOVEMBRO);
    expect(result.outcomes.find((o) => o.userId === 3)?.status).toBe("without-activity");
    expect(world.snapshots.some((s) => s.userId === 3)).toBe(false);
    expect(result.skippedWithoutActivity).toBe(1);
  });

  it("saldo 0 COM tarefa no mês ganha linha (contagem do mês existe mesmo sem saldo)", async () => {
    world.users.push({ userId: 5, name: "Elisa Sem Saldo Com Tarefa", points: 0 });
    world.completions.push({ userId: 5, completedAt: new Date("2026-10-20T12:00:00.000Z") });

    await run(RUN_1_NOVEMBRO);
    expect(world.snapshots.find((s) => s.userId === 5)).toMatchObject({ points: 0, completedTasksOfMonth: 1 });
  });
});

describe("reset mensal — idempotência por (userId, month) (não herda o QUIRK-7C)", () => {
  it("segunda run no mesmo mês: nenhuma linha nova e o mês em curso NÃO é zerado de novo", async () => {
    const primeira = await run(RUN_1_NOVEMBRO);

    // Ana volta a produzir depois do fechamento — é o saldo do mês novo, que a segunda run tem que
    // encontrar intacto.
    world.users.find((u) => u.userId === 1)!.points = 120;
    const segunda = await run(new Date("2026-11-05T12:00:00.000Z"));

    expect(segunda.month).toBe("2026-10");
    expect(segunda.closed).toBe(0);
    expect(segunda.alreadyClosed).toBe(3);
    expect(world.snapshots).toHaveLength(primeira.closed);
    expect(world.users.find((u) => u.userId === 1)!.points).toBe(120);
    expect(world.users.find((u) => u.userId === 2)!.points).toBe(0);
  });

  it("a run do MÊS seguinte fecha o mês seguinte: dezembro tem janela própria e linha própria", async () => {
    await run(RUN_1_NOVEMBRO);
    world.users.find((u) => u.userId === 1)!.points = 300;
    world.completions.push({ userId: 1, completedAt: new Date("2026-11-15T12:00:00.000Z") });

    const dezembro = await run(new Date("2026-12-01T03:00:00.000Z"));

    expect(dezembro.month).toBe("2026-11");
    expect(dezembro.closed).toBe(1);
    expect(dezembro.alreadyClosed).toBe(0);
    // Dois, não um: a conclusão das 00:00 de 01/11 (SP), que ficou FORA de outubro por ser corte
    // exclusivo, entra em NOVEMBRO por ser corte inclusivo — a janela não perde instante nenhum.
    expect(world.snapshots.find((s) => s.userId === 1 && s.month === "2026-11")).toMatchObject({
      points: 300,
      completedTasksOfMonth: 2,
    });
    expect(world.snapshots.filter((s) => s.userId === 1).map((s) => s.month)).toEqual(["2026-10", "2026-11"]);
  });

  it("mês já fechado por outra run (redeploy) é reconhecido antes de qualquer escrita", async () => {
    world.alreadyClosed.push({ userId: 1, month: "2026-10" });
    const result = await run(RUN_1_NOVEMBRO);

    expect(result.outcomes.find((o) => o.userId === 1)?.status).toBe("already-closed");
    expect(result.alreadyClosed).toBe(1);
    // Os demais continuam fechando — a idempotência é por pessoa, não uma trava global.
    expect(result.closed).toBe(2);
  });

  it("conflito de unique devolvido pelo port conta como já-fechado, não como erro", async () => {
    const cycle = fakeCycle(world);
    const original = cycle.closeMonth.bind(cycle);
    cycle.closeMonth = async (write) => (write.userId === 2 ? false : await original(write));

    const result = await new ResetMonthlyPointsUseCase({ cycle }).execute({
      actor: systemActor("MONTHLY_POINTS_RESET"),
      now: RUN_1_NOVEMBRO,
    });

    expect(result.alreadyClosed).toBe(1);
    expect(result.closed).toBe(2);
  });
});

describe("reset mensal — o gate (DEC-54)", () => {
  it("rotina sem pessoa passa: systemActor(MONTHLY_POINTS_RESET) é o bypass declarado", async () => {
    const result = await run(RUN_1_NOVEMBRO, systemActor("MONTHLY_POINTS_RESET"));
    expect(result.closed).toBe(3);
  });

  it("gestão com MANAGE_USERS também pode fechar o mês (o caminho do painel já encontra o gate)", async () => {
    const result = await run(RUN_1_NOVEMBRO, userActor(9, ["COORDENADOR"]));
    expect(result.closed).toBe(3);
  });

  it("pessoa sem a permissão não fecha mês de ninguém", async () => {
    await expect(run(RUN_1_NOVEMBRO, userActor(9, ["VOLUNTARIO"]))).rejects.toThrow(ForbiddenError);
    await expect(run(RUN_1_NOVEMBRO, userActor(9, ["VOLUNTARIO"]))).rejects.toThrow(
      MONTHLY_POINTS_RESET_DENIED_MESSAGE,
    );
    expect(world.closeCalls).toBe(0);
  });
});
