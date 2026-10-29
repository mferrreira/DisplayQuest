import { describe, expect, it } from "vitest";
import {
  ACTIVITY_EARLY_APPROVAL_MIN_DAYS,
  activityApproveConflictMessage,
  activityCompletionAward,
  canActorApproveActivityCompletionDecision,
  distributeActivityAward,
  isActivityApprovable,
  memberTaskCredits,
} from "@/backend/domain";

/**
 * V5-7b (DEC-63/74/76/77/103/104/163/164/165): a aritmética da economia congelada antes do
 * código que a consome (PLAN §7). O prêmio tem prazo (periodoFim derivado, DEC-126a), a
 * atribuição é deduplicada por par (membro, tarefa) e a distribuição Hamilton fecha com
 * "soma das partes == prêmio" em TODO ramo — inclusive divisão igual.
 */

function sum(shares: Map<number, number>): number {
  return [...shares.values()].reduce((total, value) => total + value, 0);
}

describe("prêmio da aprovação (DEC-103/74)", () => {
  // Atividade de 3 meses: abr–jun/2026 → base 300, prazo 2026-06-30 (periodoFim derivado).
  const activity = { firstMonth: "2026-04", lastMonth: "2026-06" };

  it("antecipada em exatamente 2 dias civis multiplica por 1,5", () => {
    expect(activityCompletionAward({ ...activity, approvedDay: "2026-06-28" })).toBe(450);
    expect(ACTIVITY_EARLY_APPROVAL_MIN_DAYS).toBe(2);
  });

  it("antecipada em 1 dia NÃO multiplica — a régua é ≥2 (DEC-103/97)", () => {
    expect(activityCompletionAward({ ...activity, approvedDay: "2026-06-29" })).toBe(300);
  });

  it("no prazo (no último dia) é a base cheia", () => {
    expect(activityCompletionAward({ ...activity, approvedDay: "2026-06-30" })).toBe(300);
  });

  it("atraso cobra 10% da base por dia civil", () => {
    expect(activityCompletionAward({ ...activity, approvedDay: "2026-07-01" })).toBe(270);
    expect(activityCompletionAward({ ...activity, approvedDay: "2026-07-02" })).toBe(240);
  });

  it("piso 0 no atraso (DEC-74): 10 dias e 32 dias dão o mesmo zero", () => {
    expect(activityCompletionAward({ ...activity, approvedDay: "2026-07-10" })).toBe(0);
    expect(activityCompletionAward({ ...activity, approvedDay: "2026-08-01" })).toBe(0);
  });

  it("prêmio nunca é fracionário — ×1,5 e −10%/dia saem inteiros", () => {
    expect(activityCompletionAward({ firstMonth: "2026-04", lastMonth: "2026-04", approvedDay: "2026-03-20" })).toBe(150);
    expect(activityCompletionAward({ firstMonth: "2026-01", lastMonth: "2026-07", approvedDay: "2025-12-01" })).toBe(1050);
  });
});

describe("atribuição por membro (DEC-163)", () => {
  it("tarefa com dois responsáveis dá UM crédito a cada um, nunca dois ao mesmo", () => {
    const credits = memberTaskCredits([{ taskId: 1, assigneeIds: [7, 8], completerIds: [] }]);
    expect(credits.get(7)).toBe(1);
    expect(credits.get(8)).toBe(1);
  });

  it("completador de tarefa pública entra; responsável duplicado não conta duas vezes", () => {
    const credits = memberTaskCredits([
      { taskId: 1, assigneeIds: [7], completerIds: [7] },
      { taskId: 2, assigneeIds: [], completerIds: [9] },
    ]);
    expect(credits.get(7)).toBe(1);
    expect(credits.get(9)).toBe(1);
  });

  it("duas tarefas, dois créditos; tarefa sem participante não entra", () => {
    const credits = memberTaskCredits([
      { taskId: 1, assigneeIds: [7], completerIds: [] },
      { taskId: 2, assigneeIds: [], completerIds: [7] },
      { taskId: 3, assigneeIds: [], completerIds: [] },
    ]);
    expect(credits.get(7)).toBe(2);
    expect(credits.size).toBe(1);
  });
});

describe("distribuição Hamilton (DEC-104/164/165)", () => {
  it("100 entre três iguais: 34/33/33 e o resto vai ao menor userId", () => {
    const shares = distributeActivityAward(100, [
      { userId: 5, completedTasks: 1 },
      { userId: 3, completedTasks: 1 },
      { userId: 4, completedTasks: 1 },
    ]);
    expect(shares.get(3)).toBe(34);
    expect(shares.get(4)).toBe(33);
    expect(shares.get(5)).toBe(33);
    expect(sum(shares)).toBe(100);
  });

  it("100 com 2×1: o maior contribuidor leva o maior resto (67/33)", () => {
    const shares = distributeActivityAward(100, [
      { userId: 1, completedTasks: 2 },
      { userId: 2, completedTasks: 1 },
    ]);
    expect(shares.get(1)).toBe(67);
    expect(shares.get(2)).toBe(33);
    expect(sum(shares)).toBe(100);
  });

  it("membro com zero tarefas leva 0 e nunca recebe resto", () => {
    const shares = distributeActivityAward(100, [
      { userId: 1, completedTasks: 3 },
      { userId: 2, completedTasks: 0 },
    ]);
    expect(shares.get(1)).toBe(100);
    expect(shares.get(2)).toBe(0);
    expect(sum(shares)).toBe(100);
  });

  it("empate de resto desempata por contagem de tarefas (DEC-164)", () => {
    // 10 entre 3 e 1 tarefas: 7,5 e 2,5 — resto igual (0,5); o de mais tarefas leva o +1.
    const shares = distributeActivityAward(10, [
      { userId: 1, completedTasks: 3 },
      { userId: 2, completedTasks: 1 },
    ]);
    expect(shares.get(1)).toBe(8);
    expect(shares.get(2)).toBe(2);
    expect(sum(shares)).toBe(10);
  });

  it("denominador 0: divisão igual entre os membros, soma exata (DEC-104)", () => {
    const shares = distributeActivityAward(100, [
      { userId: 1, completedTasks: 0 },
      { userId: 2, completedTasks: 0 },
      { userId: 3, completedTasks: 0 },
    ]);
    expect(shares.get(1)).toBe(34);
    expect(shares.get(2)).toBe(33);
    expect(shares.get(3)).toBe(33);
    expect(sum(shares)).toBe(100);
  });

  it("partes exitas não geram resto; prêmio 0 distribui 0", () => {
    const exact = distributeActivityAward(300, [
      { userId: 1, completedTasks: 2 },
      { userId: 2, completedTasks: 1 },
    ]);
    expect(exact.get(1)).toBe(200);
    expect(exact.get(2)).toBe(100);

    const zero = distributeActivityAward(0, [
      { userId: 1, completedTasks: 1 },
      { userId: 2, completedTasks: 1 },
    ]);
    expect([...zero.values()]).toEqual([0, 0]);
  });

  it("sem membros, nada é distribuído", () => {
    expect(distributeActivityAward(300, []).size).toBe(0);
  });
});

describe("gate de aprovar (DEC-76/77)", () => {
  it("COORDENADOR e GERENTE globais aprovam solicitação alheia", () => {
    expect(canActorApproveActivityCompletionDecision(1, ["COORDENADOR"], 2)).toBe(true);
    expect(canActorApproveActivityCompletionDecision(1, ["GERENTE"], 2)).toBe(true);
  });

  it("auto-aprovação só COORDENADOR; GERENTE não aprova o que pediu (DEC-77)", () => {
    expect(canActorApproveActivityCompletionDecision(1, ["COORDENADOR"], 1)).toBe(true);
    expect(canActorApproveActivityCompletionDecision(1, ["GERENTE"], 1)).toBe(false);
  });

  it("papel de membership GERENTE_PROJETO não aprova nada — não é global (DEC-76)", () => {
    expect(canActorApproveActivityCompletionDecision(1, ["VOLUNTARIO"], 2)).toBe(false);
    expect(canActorApproveActivityCompletionDecision(1, [], 2)).toBe(false);
  });

  it("sem solicitante (requestedBy SetNull, DEC-155) não há conflito de auto-aprovação", () => {
    expect(canActorApproveActivityCompletionDecision(1, ["GERENTE"], null)).toBe(true);
  });
});

describe("transição de aprovar (DEC-76/162)", () => {
  it("só COMPLETION_REQUESTED aceita a aprovação", () => {
    expect(isActivityApprovable("OPEN")).toBe(false);
    expect(isActivityApprovable("COMPLETION_REQUESTED")).toBe(true);
    expect(isActivityApprovable("DONE")).toBe(false);
  });

  it("a frase do 409 é por status", () => {
    expect(activityApproveConflictMessage("OPEN")).toBe(
      "A conclusão desta atividade ainda não foi solicitada",
    );
    expect(activityApproveConflictMessage("DONE")).toBe("Esta atividade já foi concluída");
  });
});
