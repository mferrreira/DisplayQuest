// @vitest-environment node
/**
 * plan-v21 · S01 (DEC-257) — a atividade selecionável ao criar tarefa.
 *
 * A regra é do domínio, não da tela: o seletor, o servidor e o mock consomem a mesma função.
 * O seletor de criação hoje só cortava linha passada (DEC-99, `isActivityPast`); a regra nova
 * acrescenta o status: só OPEN é destino de tarefa nova. Linha pedida-conclusão e linha aprovada
 * não recebem tarefa nova (decisão do dono em 2026-11-09: "Só OPEN").
 *
 * O que a regra NÃO faz: recusa no update. Uma tarefa já ligada a uma etapa que virou
 * COMPLETION_REQUESTED ou DONE continua salvável — o corpo do PUT reenvia o mesmo `activityId`
 * (mesma razão medida da DEC-99 para linha passada).
 */
import { describe, expect, it } from "vitest";

import { isActivitySelectableForNewTask } from "@/backend/domain";

describe("atividade selecionável ao criar tarefa", () => {
  it("OPEN é selecionável", () => {
    expect(isActivitySelectableForNewTask("OPEN")).toBe(true);
  });

  it("COMPLETION_REQUESTED não é: linha já pedida para conclusão não recebe tarefa nova", () => {
    expect(isActivitySelectableForNewTask("COMPLETION_REQUESTED")).toBe(false);
  });

  it("DONE não é", () => {
    expect(isActivitySelectableForNewTask("DONE")).toBe(false);
  });

  it("o vocabulário inteiro está coberto pela regra", () => {
    // Se o vocabulário crescer, este teste força a regra a dizer o que vale para a nova linha.
    const statuses = ["OPEN", "COMPLETION_REQUESTED", "DONE"] as const;
    const selectable = statuses.filter(isActivitySelectableForNewTask);
    expect(selectable).toEqual(["OPEN"]);
  });
});
