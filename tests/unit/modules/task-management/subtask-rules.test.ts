// @vitest-environment node
/**
 * plan-v4 · V4-4 — as regras puras de subtask (`backend/domain/task/subtask-rules.ts` e o
 * acréscimo em `points-rules.ts`).
 *
 * Escrito ANTES do código. Duas decisões do dono se sucederam aqui: a DEC-78 (cada subtask
 * pontuada pela regra da mãe, no instante da própria conclusão) foi SUBSTITUÍDA pela DEC-97
 * (2026-10-07): subtask é +5 fixo à base da mãe, e a mãe inteira atravessa o calendário uma vez
 * só. A DEC-98, do mesmo dia, acrescenta o gate de marcação (mãe em Andamento).
 *
 * Nada de Prisma nem de relógio: `now` entra por parâmetro em tudo, como no resto do domínio.
 */
import { describe, expect, it } from "vitest";

import {
  EARLY_DELIVERY_MULTIPLIER,
  POINTS_PER_TASK,
  SUBTASK_POINTS,
  ValidationError,
  awardPointsForCompletion,
  createSubtaskRecord,
  isCompletionTargetStatus,
  openSubtasksCount,
  shouldAutoMoveMotherToReview,
  subtaskBasePoints,
  totalAwardForCompletion,
  assertSubtasksAllowTransition,
  canEditSubtasksOf,
  canMarkSubtasksOf,
  subtaskMarkMessage,
  SUBTASK_MARKABLE_STATUSES,
  SUBTASK_TITLE_MAX_LENGTH,
} from "@/backend/domain";

/**
 * Prazo 20/10, mãe concluída/aprovada em 25/10 (5 dias de atraso), subtasks concluídas em
 * 19/10 (1 dia adiantada), 21/10 (1 dia atrasada) e 24/10 (4 dias atrasada).
 */
const DUE = "2026-10-20";
const APPROVAL = new Date("2026-10-25T12:00:00.000Z"); // 09h de Brasília do dia 25
const EARLY = new Date("2026-10-19T12:00:00.000Z");
const ONE_DAY_LATE = new Date("2026-10-21T12:00:00.000Z");
const FOUR_DAYS_LATE = new Date("2026-10-24T12:00:00.000Z");

/** Uma subtask concluída. `completed` é obrigatório na assinatura de propósito. */
const done = (completedAt: Date | null = null, dueDate: string | null = DUE) => ({
  dueDate,
  completed: true,
  completedAt,
});

describe("V4-4 · DEC-97 — subtask é +5 fixo à base da mãe, calendário uma vez só", () => {
  it("o exemplo da DEC-78 recalculado: mãe −40, com 3 subtasks concluídas a base vira 25 → −25", () => {
    const subtasks = [done(EARLY), done(ONE_DAY_LATE), done(FOUR_DAYS_LATE)];

    // A mãe sozinha continua valendo a regra de sempre (10 − dias·10).
    expect(awardPointsForCompletion({ dueDate: DUE }, APPROVAL)).toBe(-40);
    // Base 10 + 3·5 = 25, menos 5 dias de atraso × 10. O instante de conclusão de CADA subtask
    // não entra mais na conta (a leitura da DEC-78 morreu na DEC-97).
    expect(totalAwardForCompletion({ dueDate: DUE }, subtasks, APPROVAL)).toBe(-25);
  });

  it("cada subtask concluída soma exatamente SUBTASK_POINTS (5) à base", () => {
    expect(SUBTASK_POINTS).toBe(5);
    // No prazo: base 15 → 15 (sem bônus, sem penalidade).
    expect(totalAwardForCompletion({ dueDate: DUE }, [done()], new Date("2026-10-20T12:00:00.000Z"))).toBe(15);
    expect(
      totalAwardForCompletion(
        { dueDate: DUE },
        [done(), done(), done()],
        new Date("2026-10-20T12:00:00.000Z"),
      ),
    ).toBe(25);
  });

  it("o atraso da MÃE desconta uma vez só, com a base já somada (DEC-39 sem piso)", () => {
    // Base 10 + 1·5 = 15, 1 dia de atraso → 15 − 10 = 5.
    expect(totalAwardForCompletion({ dueDate: DUE }, [done(ONE_DAY_LATE)], ONE_DAY_LATE)).toBe(5);
    // 5 dias de atraso: 25 − 50 = −25 (já coberto acima) e sem subtask: 10 − 50 = −40.
    expect(totalAwardForCompletion({ dueDate: DUE }, [], APPROVAL)).toBe(-40);
  });

  it("subtask ABERTA não entra na conta: só o que foi concluído soma", () => {
    const open = { completed: false };
    // 1 dia adiantada: régua de 2 dias não dispara, a base fica inteira (10 + 5).
    expect(
      totalAwardForCompletion({ dueDate: DUE }, [done(EARLY), open], new Date("2026-10-19T12:00:00.000Z")),
    ).toBe(15);
    // Zero concluída vale zero — é a mãe sem subtask.
    expect(totalAwardForCompletion({ dueDate: DUE }, [open], APPROVAL)).toBe(-40);
  });

  it("mãe sem prazo: nenhuma subtask pode estar atrasada — o inteiro é a base", () => {
    const subtasks = [done(EARLY, null), done(FOUR_DAYS_LATE, null)];
    expect(totalAwardForCompletion({ dueDate: null }, subtasks, APPROVAL)).toBe(POINTS_PER_TASK + 2 * SUBTASK_POINTS);
    expect(totalAwardForCompletion({ dueDate: null }, subtasks, APPROVAL)).toBe(20);
  });

  it("sem subtask o total é exatamente o que a mãe valia antes — nada mudou para tarefa simples", () => {
    expect(totalAwardForCompletion({ dueDate: DUE }, [], APPROVAL)).toBe(awardPointsForCompletion({ dueDate: DUE }, APPROVAL));
    expect(totalAwardForCompletion({ dueDate: DUE }, [], APPROVAL)).toBe(-40);
  });

  it("bônus de 50% com pelo menos 2 dias adiantada vale para a base COM subtask (DEC-97)", () => {
    // 18/10 é 2 dias civis antes do prazo: (10 + 3·5) × 1,5 = 37,5 arredondado para 38.
    const threeDone = [done(EARLY), done(EARLY), done(EARLY)];
    expect(
      totalAwardForCompletion({ dueDate: DUE }, threeDone, new Date("2026-10-18T12:00:00.000Z")),
    ).toBe(Math.round(25 * EARLY_DELIVERY_MULTIPLIER));
    expect(
      totalAwardForCompletion({ dueDate: DUE }, threeDone, new Date("2026-10-18T12:00:00.000Z")),
    ).toBe(38);
    // 1 dia adiantada não basta mais (a régua da DEC-32 era 1 dia; a dono endureceu para 2).
    expect(
      totalAwardForCompletion({ dueDate: DUE }, threeDone, new Date("2026-10-19T12:00:00.000Z")),
    ).toBe(25);
  });

  it("a base gravada em tasks.points é 10 + 5·n (número de subtasks, sem prazo no caminho)", () => {
    expect(subtaskBasePoints(0)).toBe(10);
    expect(subtaskBasePoints(1)).toBe(15);
    expect(subtaskBasePoints(3)).toBe(25);
  });
});

describe("V4-4/V4-5 · DEC-98 — marcar subtask exige a mãe em Andamento", () => {
  it("só in-progress aceita marcar", () => {
    expect(canMarkSubtasksOf("in-progress")).toBe(true);
    expect(canMarkSubtasksOf("to-do")).toBe(false);
    expect(canMarkSubtasksOf("in-review")).toBe(false);
    expect(canMarkSubtasksOf("adjust")).toBe(false);
    expect(canMarkSubtasksOf("done")).toBe(false);
    expect(SUBTASK_MARKABLE_STATUSES).toEqual(["in-progress"]);
  });

  it("a frase é uma só — o toast e o 409 da rota dizem exatamente isto", () => {
    expect(subtaskMarkMessage()).toBe("A tarefa precisa estar em Andamento para marcar subtasks.");
  });
});

describe("V4-4 · DEC-57 — a trava: nada termina com subtask aberta", () => {
  it("entrar em Em Revisão ou Concluído é bloqueado; voltar para A Fazer, Em Andamento ou Ajustes não", () => {
    expect(isCompletionTargetStatus("in-review")).toBe(true);
    expect(isCompletionTargetStatus("done")).toBe(true);
    expect(isCompletionTargetStatus("to-do")).toBe(false);
    expect(isCompletionTargetStatus("in-progress")).toBe(false);
    expect(isCompletionTargetStatus("adjust")).toBe(false);
  });

  it("a trava vale vindo de QUALQUER coluna — fecha o A Fazer → Em Revisão direto", () => {
    for (const next of ["in-review", "done"] as const) {
      expect(() => assertSubtasksAllowTransition(next, 2)).toThrow(ValidationError);
    }
    expect(() => assertSubtasksAllowTransition("in-progress", 2)).not.toThrow();
    expect(() => assertSubtasksAllowTransition("adjust", 2)).not.toThrow();
    expect(() => assertSubtasksAllowTransition("to-do", 2)).not.toThrow();
  });

  it("sem subtask aberta nada é bloqueado", () => {
    for (const next of ["in-review", "done", "to-do", "in-progress", "adjust"] as const) {
      expect(() => assertSubtasksAllowTransition(next, 0)).not.toThrow();
    }
  });

  it("a mensagem diz QUANTAS faltam, em português, e no singular quando é uma", () => {
    expect(() => assertSubtasksAllowTransition("in-review", 2)).toThrow(/as 2 subtasks restantes/);
    expect(() => assertSubtasksAllowTransition("done", 1)).toThrow(/a subtask restante/);
    expect(() => assertSubtasksAllowTransition("done", 1)).not.toThrow(/as 1 subtask/);
  });

  it("contar abertas é contar o que não está concluído", () => {
    expect(openSubtasksCount([{ completed: true }, { completed: false }, { completed: false }])).toBe(2);
    expect(openSubtasksCount([{ completed: true }])).toBe(0);
    expect(openSubtasksCount([])).toBe(0);
  });
});

describe("V4-4 · janela — quando a mãe aceita mexer em subtask", () => {
  it("A Fazer, Em Andamento e Ajustes aceitam; Em Revisão e Concluído não", () => {
    expect(canEditSubtasksOf("to-do")).toBe(true);
    expect(canEditSubtasksOf("in-progress")).toBe(true);
    expect(canEditSubtasksOf("adjust")).toBe(true);
    expect(canEditSubtasksOf("in-review")).toBe(false);
    expect(canEditSubtasksOf("done")).toBe(false);
  });
});

describe("V4-4 · auto-mover a mãe quando a última subtask é concluída", () => {
  const allDone = [{ completed: true }, { completed: true }];
  const oneOpen = [{ completed: true }, { completed: false }];

  it("só a partir de Em Andamento", () => {
    expect(shouldAutoMoveMotherToReview("in-progress", allDone)).toBe(true);
    expect(shouldAutoMoveMotherToReview("to-do", allDone)).toBe(false);
    expect(shouldAutoMoveMotherToReview("adjust", allDone)).toBe(false);
    expect(shouldAutoMoveMotherToReview("in-review", allDone)).toBe(false);
    expect(shouldAutoMoveMotherToReview("done", allDone)).toBe(false);
  });

  it("só quando TODAS estão concluídas, e só se houver subtask", () => {
    expect(shouldAutoMoveMotherToReview("in-progress", oneOpen)).toBe(false);
    expect(shouldAutoMoveMotherToReview("in-progress", [])).toBe(false);
  });
});

describe("V4-4 · título da subtask", () => {
  it("título é obrigatório e sai aparado", () => {
    expect(() => createSubtaskRecord({ title: "" })).toThrow(ValidationError);
    expect(() => createSubtaskRecord({ title: "   " })).toThrow(ValidationError);
    expect(createSubtaskRecord({ title: "  Calibrar o sensor  " }).title).toBe("Calibrar o sensor");
  });

  it("mesmo teto do título da tarefa (200), e a mãe não é subtask", () => {
    expect(SUBTASK_TITLE_MAX_LENGTH).toBe(200);
    expect(() => createSubtaskRecord({ title: "x".repeat(201) })).toThrow(ValidationError);
    expect(createSubtaskRecord({ title: "x".repeat(200) }).title).toHaveLength(200);
  });

  it("nasce não concluída, sem id e sem data — quem escreve data é o caso de uso", () => {
    const record = createSubtaskRecord({ title: "Ler o protocolo" });
    expect(record.completed).toBe(false);
    expect(record.completedAt).toBeNull();
    expect(record.id).toBeUndefined();
  });
});

describe("V4-4 · o que a regra NÃO é", () => {
  it("subtask não tem prazo próprio: o prazo usado é sempre o da mãe (D-D)", () => {
    // A assinatura de pontuação recebe dueDate por parâmetro justamente porque a subtask não o tem.
    const subtasks = [done(ONE_DAY_LATE)];
    expect(totalAwardForCompletion({ dueDate: DUE }, subtasks, ONE_DAY_LATE)).toBe(5);
    // Com a mãe sem prazo, a mesma subtask não sofre atraso algum.
    expect(totalAwardForCompletion({ dueDate: null }, subtasks, ONE_DAY_LATE)).toBe(15);
    expect(EARLY_DELIVERY_MULTIPLIER).toBe(1.5);
  });

  it("concluir subtask não credita nada na hora: o prêmio só sai na conclusão/aprovação da mãe", () => {
    // A assinatura devolve a base da mãe para a data pedida — não existe "premio da subtask"
    // em lugar nenhum do domínio desde a DEC-97 (`awardPointsForSubtask` foi removido).
    expect(totalAwardForCompletion({ dueDate: DUE }, [done()], new Date("2026-10-20T12:00:00.000Z"))).toBe(15);
  });
});
