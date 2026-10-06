// @vitest-environment node
/**
 * plan-v4 · V4-4 — as regras puras de subtask (`backend/domain/task/subtask-rules.ts` e o
 * acréscimo em `points-rules.ts`).
 *
 * Escrito ANTES do código. A resposta do dono para a aritmética (DEC-78) substitui a fórmula
 * que estava gravada na DEC-56: cada subtask é pontuada pela MESMA regra da mãe, com o prazo
 * herdado dela e o instante de conclusão próprio. O exemplo abaixo é o que foi mostrado ao dono
 * e é o que ele escolheu — por isso ele está aqui literal, com as datas e o total.
 *
 * Nada de Prisma nem de relógio: `now` entra por parâmetro em tudo, como no resto do domínio.
 */
import { describe, expect, it } from "vitest";

import {
  EARLY_DELIVERY_MULTIPLIER,
  POINTS_PER_TASK,
  ValidationError,
  awardPointsForCompletion,
  awardPointsForSubtask,
  createSubtaskRecord,
  isCompletionTargetStatus,
  openSubtasksCount,
  shouldAutoMoveMotherToReview,
  subtaskBasePoints,
  totalAwardForCompletion,
  assertSubtasksAllowTransition,
  canEditSubtasksOf,
  SUBTASK_TITLE_MAX_LENGTH,
} from "@/backend/domain";

/**
 * O exemplo combinado com o dono: prazo 20/10, mãe aprovada em 25/10 (5 dias de atraso),
 * três subtasks concluídas em 19/10 (adiantada), 21/10 (1 dia atrasada) e 24/10 (4 dias atrasada).
 */
const DUE = "2026-10-20";
const APPROVAL = new Date("2026-10-25T12:00:00.000Z"); // 09h de Brasília do dia 25
const EARLY = new Date("2026-10-19T12:00:00.000Z");
const ONE_DAY_LATE = new Date("2026-10-21T12:00:00.000Z");
const FOUR_DAYS_LATE = new Date("2026-10-24T12:00:00.000Z");

/** Uma subtask pontuável concluída. `completed` é obrigatório na assinatura de propósito. */
const done = (completedAt: Date | null, dueDate: string | null = DUE) => ({
  dueDate,
  completed: true,
  completedAt,
});

describe("V4-4 · DEC-78 — cada subtask é pontuada pela mesma regra da mãe", () => {
  it("o exemplo combinado com o dono: mãe −40, subtasks +15, 0 e −30 → total −55", () => {
    const subtasks = [done(EARLY), done(ONE_DAY_LATE), done(FOUR_DAYS_LATE)];

    // A mãe sozinha continua valendo a regra de sempre (10 − dias·10).
    expect(awardPointsForCompletion({ dueDate: DUE }, APPROVAL)).toBe(-40);
    expect(totalAwardForCompletion({ dueDate: DUE }, subtasks, APPROVAL)).toBe(-55);
  });

  it("subtask adiantada rende 15, no prazo 10, 1 dia atrasada 0, 2 dias −10 (DEC-39 sem piso)", () => {
    expect(awardPointsForSubtask(done(new Date("2026-10-18T12:00:00.000Z")), APPROVAL)).toBe(15);
    expect(awardPointsForSubtask(done(new Date("2026-10-20T12:00:00.000Z")), APPROVAL)).toBe(10);
    expect(awardPointsForSubtask(done(ONE_DAY_LATE), APPROVAL)).toBe(0);
    expect(awardPointsForSubtask(done(new Date("2026-10-22T12:00:00.000Z")), APPROVAL)).toBe(-10);
  });

  it("o atraso de cada subtask é medido no instante em que ELA foi concluída, não na aprovação", () => {
    // Concluída no prazo, mas a mãe só foi aprovada 5 dias depois: a subtask não é atrasada.
    expect(awardPointsForSubtask(done(new Date("2026-10-20T12:00:00.000Z")), APPROVAL)).toBe(10);
    // E o contrário: concluída tarde, aprovada junto com a mãe.
    expect(awardPointsForSubtask(done(APPROVAL), APPROVAL)).toBe(-40);
  });

  it("subtask concluída sem data de conclusão é medida no instante em que a mãe é concluída (defensivo)", () => {
    expect(awardPointsForSubtask(done(null), APPROVAL)).toBe(-40);
  });

  it("subtask ABERTA não entra na conta: só o que foi concluído soma", () => {
    const open = { dueDate: DUE, completed: false, completedAt: null };
    expect(totalAwardForCompletion({ dueDate: DUE }, [done(EARLY), open], new Date("2026-10-19T12:00:00.000Z"))).toBe(
      15 + 15,
    );
  });

  it("mãe sem prazo: nenhuma subtask pode estar atrasada — cada uma vale o inteiro", () => {
    const subtasks = [done(EARLY, null), done(FOUR_DAYS_LATE, null)];
    expect(awardPointsForSubtask(done(FOUR_DAYS_LATE, null), APPROVAL)).toBe(POINTS_PER_TASK);
    expect(totalAwardForCompletion({ dueDate: null }, subtasks, APPROVAL)).toBe(POINTS_PER_TASK + 2 * POINTS_PER_TASK);
  });

  it("sem subtask o total é exatamente o que a mãe valia antes — nada mudou para tarefa simples", () => {
    expect(totalAwardForCompletion({ dueDate: DUE }, [], APPROVAL)).toBe(awardPointsForCompletion({ dueDate: DUE }, APPROVAL));
    expect(totalAwardForCompletion({ dueDate: DUE }, [], APPROVAL)).toBe(-40);
  });

  it("subtask concluída no prazo soma 10 por unidade à base (DEC-56 preservada no caso sem atraso)", () => {
    const onTime = [EARLY, EARLY, EARLY].map((completedAt) => done(completedAt));
    // Mãe adiantada: 10·1,5 = 15. Três subtasks adiantadas: 3·15 = 45.
    expect(totalAwardForCompletion({ dueDate: DUE }, onTime, new Date("2026-10-19T12:00:00.000Z"))).toBe(15 + 45);
  });

  it("a base gravada em tasks.points é 10 + 10·n (número de subtasks, sem prazo no caminho)", () => {
    expect(subtaskBasePoints(0)).toBe(10);
    expect(subtaskBasePoints(1)).toBe(20);
    expect(subtaskBasePoints(3)).toBe(40);
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
    expect(awardPointsForSubtask(done(ONE_DAY_LATE), APPROVAL)).toBe(0);
    expect(EARLY_DELIVERY_MULTIPLIER).toBe(1.5);
  });
});
