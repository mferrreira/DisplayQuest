// @vitest-environment node
/**
 * plan-v9 S04 (MODELO §7, R12, DEC-232) — `ReadUserBoardMonthsUseCase` puro.
 *
 * Escrito depois do review pedindo o pin (o teste de componente entregava `monthLabel` pronto,
 * então a conversão de rótulo, a ordem desc e a recusa de mês sem rótulo só existiam na
 * produção). O duplo é a porta só dela — o use case não tem ator nem outra dependência (R12:
 * projecão do histórico que o autenticado já lê por mês).
 *
 * O que este arquivo trava:
 *  - ordem desc por mês é reafirmada no use case, mesmo quando a porta desordena — a ordem de
 *    exibição é contrato, não acaso do `orderBy` do banco;
 *  - rótulo humano (`civilMonthLabel`) entra na linha de saída; mês sem rótulo é dado fora do
 *    contrato do fechamento e falha NOMEANDO (ValidationError), não vira string vazia em silêncio;
 *  - `userId` inválido (não-inteiro, 0, negativo) é recusado nomeando o campo;
 *  - pessoa sem meses: lista vazia com a frase do estado, e a frase NÃO acompanha a lista cheia.
 */
import { describe, expect, it } from "vitest";

import { ReadUserBoardMonthsUseCase } from "@/backend/modules/gamification/application/use-cases/read-user-board-months.use-case";
import type { BoardMonthClosePort } from "@/backend/modules/gamification/application/ports/board-month-close.port";
import type { MonthCloseRow } from "@/backend/domain/gamification";

function row(over: Partial<MonthCloseRow> & { month: string; value: number; position: number }): MonthCloseRow {
  const base = new Date("2028-02-01T03:00:00.000Z");
  return {
    userId: 22,
    userName: "Carla Lima",
    track: "MONTH_POINTS",
    periodStart: base,
    periodEnd: base,
    closedAt: base,
    ...over,
  };
}

function portWith(rows: MonthCloseRow[]) {
  const calls: Array<{ userId: number; track: string }> = [];
  // A anotação é o que dá tipo contextual aos métodos (a linha de fechamento e o `as never` não dão).
  const port: BoardMonthClosePort & { calls: typeof calls } = {
    calls,
    async findClosedMonth() {
      throw new Error("não chamado");
    },
    async listPeopleForClose() {
      throw new Error("não chamado");
    },
    async writeClose() {
      throw new Error("não chamado");
    },
    async readClosedMonth() {
      throw new Error("não chamado");
    },
    async listClosedMonths() {
      throw new Error("não chamado");
    },
    async listClosedMonthsForUser(userId, track) {
      calls.push({ userId, track });
      return rows;
    },
  };
  return port;
}

describe("ReadUserBoardMonthsUseCase — os meses de uma pessoa", () => {
  it("ordena do mais recente ao mais antigo e preserva posição e valor", async () => {
    // A porta desordenou de propósito: a ordem de exibição é reafirmada no use case.
    const port = portWith([
      row({ month: "2027-12", value: 40, position: 2 }),
      row({ month: "2028-01", value: 30, position: 1 }),
    ]);

    const read = await new ReadUserBoardMonthsUseCase(port).execute(22);

    expect(read.userId).toBe(22);
    expect(read.track).toBe("MONTH_POINTS");
    expect(port.calls).toEqual([{ userId: 22, track: "MONTH_POINTS" }]);
    expect(read.months).toEqual([
      { month: "2028-01", monthLabel: "janeiro de 2028", value: 30, position: 1 },
      { month: "2027-12", monthLabel: "dezembro de 2027", value: 40, position: 2 },
    ]);
    expect(read.notice).toBe("");
  });

  it("pessoa sem fechamento: lista vazia com a frase do estado, e a trilha é fixa", async () => {
    const read = await new ReadUserBoardMonthsUseCase(portWith([])).execute(22);

    expect(read.months).toEqual([]);
    expect(read.notice).toContain("Nenhum mês fechado");
    expect(read.track).toBe("MONTH_POINTS");
  });

  it("userId inválido é recusado nomeando o campo, sem leitura da porta", async () => {
    const port = portWith([]);
    const useCase = new ReadUserBoardMonthsUseCase(port);

    for (const bad of [0, -1, 3.5, Number.NaN]) {
      await expect(useCase.execute(bad as never)).rejects.toThrow(/userId/);
    }
    expect(port.calls).toEqual([]);
  });

  it("mês sem rótulo é dado fora do contrato: falha nomeando mês e pessoa, não string vazia", async () => {
    const port = portWith([row({ month: "28-01", value: 10, position: 1 })]);

    await expect(new ReadUserBoardMonthsUseCase(port).execute(22)).rejects.toThrow(/28-01/);
  });
});
