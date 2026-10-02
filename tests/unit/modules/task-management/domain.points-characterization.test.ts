// @vitest-environment node
/**
 * plan-v3 · batch 1.A — CARACTERIZAÇÃO do comportamento de pontos antes da Onda 1.
 *
 * Por que este arquivo existe: a Onda 1 muda a aritmética de atraso (DEC-31) e o plano exige
 * que o comportamento anterior fique registrável de forma executável, não só no git. A fórmula
 * atual está copiada abaixo (`legacyLatePenalty` / `legacyAward`). Em 1.A ela é comparada com as
 * funções reais do backend e do frontend, o que prova que a cópia é fiel ao código de produção.
 * Em 1.B, quando `backend/domain/task/points-rules.ts` existir, este mesmo arquivo ganha o bloco
 * legado × v3 e continua verde: o legado deixa de ser código em produção e passa a ser
 * documentação viva do que mudou e do que foi preservado por decisão (DEC-37, DEC-39).
 *
 * Caso que originou o plano — medido na interface real na captura do guia de 2026-10-02:
 *   "PONTOS 60 pts(agora: -37140 pts com penalidade)"
 * reproduzido literalmente em `caso medido na interface`.
 *
 * TZ fixado: o espelho do frontend parseia data-only como meio-dia LOCAL
 * (`features/tasks/utils/move-rules.ts:134-136`), então sem fuso determinístico os números
 * dependeriam da máquina. O laboratório opera em America/Sao_Paulo (UTC-3 fixo, sem DST desde
 * 2019 — mesmo pressuposto de `backend/domain/reporting/ReportPeriod.ts:41`).
 */
process.env.TZ = "America/Sao_Paulo";

import { describe, expect, it } from "vitest";

import { awardPointsForCompletion, calculateLatePenalty } from "@/backend/domain";
import { latePenalty, projectedAward } from "@/features/tasks/utils/move-rules";

const DAY_MS = 1000 * 60 * 60 * 24;

/** Cópia congelada de `backend/domain/task/task-rules.ts:114-133` (estado pré-v3). */
function legacyLatePenalty(
  task: { points: number; dueDate?: string | null },
  completionDate: Date,
): number {
  if (!task.dueDate) return 0;
  const dueDate = new Date(task.dueDate);
  const daysLate = Math.ceil((completionDate.getTime() - dueDate.getTime()) / DAY_MS);
  if (daysLate <= 0) return 0;
  return daysLate * task.points;
}

/** Cópia congelada de `backend/domain/task/task-rules.ts:127-133` (estado pré-v3). */
function legacyAward(
  task: { points: number; dueDate?: string | null },
  completionDate: Date,
): number {
  return task.points - legacyLatePenalty(task, completionDate);
}

/**
 * `tasks.dueDate` é `String?` (prisma/schema.prisma) e o formulário do quadro envia
 * `YYYY-MM-DD` cru (`features/tasks/components/task-dialog.tsx:200`, `<Input type="date">`).
 * É a forma que o bug observa na prática.
 */
const DUE_TODAY = "2026-06-15";

describe("plan-v3 1.A · a cópia legado é fiel ao backend de hoje", () => {
  const instants = [
    "2026-06-12T18:00:00.000Z",
    "2026-06-15T00:00:00.000Z",
    "2026-06-15T11:00:00.000Z",
    "2026-06-15T18:00:00.000Z",
    "2026-06-16T02:00:00.000Z",
    "2026-06-20T18:00:00.000Z",
  ];

  it("penalidade idêntica à função real, em cada instante testado", () => {
    for (const iso of instants) {
      const completion = new Date(iso);
      expect(legacyLatePenalty({ points: 10, dueDate: DUE_TODAY }, completion)).toBe(
        calculateLatePenalty({ points: 10, dueDate: DUE_TODAY }, completion),
      );
      expect(legacyAward({ points: 10, dueDate: DUE_TODAY }, completion)).toBe(
        awardPointsForCompletion({ points: 10, dueDate: DUE_TODAY }, completion),
      );
    }
  });

  it("sem prazo: legado e real coincidem em 0 de penalidade", () => {
    const completion = new Date("2026-06-15T18:00:00.000Z");
    expect(legacyLatePenalty({ points: 4, dueDate: null }, completion)).toBe(0);
    expect(calculateLatePenalty({ points: 4, dueDate: null }, completion)).toBe(0);
    expect(legacyAward({ points: 4, dueDate: null }, completion)).toBe(4);
  });
});

describe("plan-v3 1.A · o bug que originou o plano (pré-v3)", () => {
  it("prazo HOJE, entregue HOJE: o dia inteiro rende zero, menos a meia-noite UTC exata", () => {
    // dueDate date-only vira meia-noite UTC. Qualquer hora do dia soma fração de 24h,
    // e ceil(fração) = 1 dia de atraso -> a penalidade come todos os pontos.
    const sameDay = [
      "2026-06-15T05:00:00.000Z", // 02h de Brasília
      "2026-06-15T11:00:00.000Z", // 08h de Brasília
      "2026-06-15T18:00:00.000Z", // 15h de Brasília
      "2026-06-15T21:00:00.000Z", // 18h de Brasília
      "2026-06-15T23:30:00.000Z", // 20h30 de Brasília
    ].map((iso) => new Date(iso));
    for (const completion of sameDay) {
      expect(legacyAward({ points: 10, dueDate: DUE_TODAY }, completion)).toBe(0);
    }
    // O único instante do dia que escapa é o exato match com a meia-noite UTC.
    expect(legacyAward({ points: 10, dueDate: DUE_TODAY }, new Date("2026-06-15T00:00:00.000Z"))).toBe(10);
  });

  it("23h de atraso contam como 1 dia; 26h contam como 2 (ceil de fração)", () => {
    expect(legacyLatePenalty({ points: 10, dueDate: "2026-06-14T13:00:00.000Z" }, new Date("2026-06-15T12:00:00.000Z"))).toBe(10);
    expect(legacyLatePenalty({ points: 10, dueDate: DUE_TODAY }, new Date("2026-06-16T02:00:00.000Z"))).toBe(20);
  });

  it("caso medido na interface: 60 pts, prazo 21/01/2025, concluída em 02/10/2026 -> -37140", () => {
    const task = { points: 60, dueDate: "2025-01-21" };
    const completion = new Date("2026-10-02T18:00:00.000Z"); // 15h de Brasília
    expect(legacyLatePenalty(task, completion)).toBe(37200); // 620 dias x 60
    expect(legacyAward(task, completion)).toBe(-37140);
    // Idêntico ao que a interface exibiu na captura do guia.
    expect(awardPointsForCompletion(task, completion)).toBe(-37140);
  });

  it("premissa preservada em v3 (DEC-39): a penalidade pode exceder os pontos", () => {
    expect(legacyAward({ points: 10, dueDate: "2026-06-13T12:00:00.000Z" }, new Date("2026-06-15T12:00:00.000Z"))).toBe(-10);
  });
});

describe("plan-v3 1.A · o espelho do frontend divergia do backend (R5)", () => {
  /**
   * `latePenalty` (features/tasks/utils/move-rules.ts:130-142) parseia data-only como
   * MEIO-DIA LOCAL; o backend parseia como meia-noite UTC. As duas matemáticas produziam
   * números diferentes para a mesma tarefa e o mesmo instante.
   */
  it("no dia do prazo de manhã, o cartão mostrava 10 pontos e o servidor creditava 0", () => {
    for (const iso of ["2026-06-15T08:00:00.000Z", "2026-06-15T11:00:00.000Z"]) {
      const task = { points: 10, dueDate: DUE_TODAY };
      const completion = new Date(iso);
      expect(projectedAward(task, completion)).toBe(10); // o que a pessoa via no quadro
      expect(awardPointsForCompletion(task, completion)).toBe(0); // o que o servidor dava
    }
  });

  it("23h de Brasília no dia do prazo: cartão dizia 0, servidor debitava -10", () => {
    const task = { points: 10, dueDate: DUE_TODAY };
    const completion = new Date("2026-06-16T02:00:00.000Z");
    expect(projectedAward(task, completion)).toBe(0);
    expect(awardPointsForCompletion(task, completion)).toBe(-10);
  });

  it("nos casos de adiamento largo as duas matemáticas coincidiam (a divergência é de borda)", () => {
    const task = { points: 60, dueDate: "2025-01-21" };
    const completion = new Date("2026-10-02T18:00:00.000Z");
    expect(latePenalty(task, completion)).toBe(calculateLatePenalty(task, completion));
    expect(projectedAward(task, completion)).toBe(awardPointsForCompletion(task, completion));
  });
});
