// @vitest-environment node
/**
 * plan-v3 OND4-A (AC-P3-08) — a fronteira do prêmio devolve o valor **creditado**.
 *
 * Medido antes de escrever (2026-10-03): `awardFromTaskCompletion` (gamification) devolve
 * `GamificationAwardResult { pointsAwarded, alreadyAwarded, newProgression }`, e o adaptador
 * daqui **descartava** — a porta era `Promise<void>`. Os casos de uso só conheciam o valor que
 * *pediram* (`awardPointsForCompletion`), que não é o creditado por três razões que existem e
 * são congeladas do outro lado:
 *
 *   1. **idempotência**: award já registrado → creditado 0, pedido 10;
 *   2. **`taskAwardPoints`**: `Math.floor` sem clamp no caminho de tarefa;
 *   3. **falha**: award que estoura é engolido (a conclusão não pode quebrar), e aí o honesto
 *      é `null` — "ninguém creditado" — e não 0, que a interface leria como "valeu zero".
 *
 * É este arquivo que impede a próxima refatoração de trocar `outcome.pointsAwarded` pelo valor
 * do pedido e ninguém notar: o número que a animação da Onda 4.B mostra é o daqui.
 */
import { describe, expect, it, vi } from "vitest";
import { createTaskProgressEvents } from "@/backend/modules/task-management/infrastructure/gamification-task-progress.events";
import { publishTaskCompletionAward } from "@/backend/modules/task-management/application/use-cases/internal/task-view";

describe("gamification-task-progress.events — o creditado atravessa a porta (OND4-A)", () => {
  it("devolve o valor creditado pelo award, e não o valor pedido", async () => {
    const awardFromTaskCompletion = vi.fn(async () => ({ pointsAwarded: 0, alreadyAwarded: true }));
    const events = createTaskProgressEvents({ awards: { awardFromTaskCompletion } });

    // O pedido foi 15 (o que o domínio calculou); o creditado foi 0 (o award já existia).
    const credited = await events.onTaskCompleted({ userId: 3, taskId: 7, taskPoints: 15, projectId: null });

    expect(awardFromTaskCompletion).toHaveBeenCalledWith({ userId: 3, taskId: 7, taskPoints: 15 });
    expect(credited).toBe(0);
  });

  it("repassa prêmio negativo sem piso (DEC-39)", async () => {
    const events = createTaskProgressEvents({
      awards: { awardFromTaskCompletion: async () => ({ pointsAwarded: -37140 }) },
    });

    expect(await events.onTaskCompleted({ userId: 3, taskId: 7, taskPoints: -37140, projectId: null })).toBe(-37140);
  });

  it("sem userId/taskId não credita ninguém e não chama o award", async () => {
    const awardFromTaskCompletion = vi.fn(async () => ({ pointsAwarded: 10 }));
    const events = createTaskProgressEvents({ awards: { awardFromTaskCompletion } });

    expect(await events.onTaskCompleted({ userId: 0, taskId: 7, taskPoints: 10, projectId: null })).toBeNull();
    expect(await events.onTaskCompleted({ userId: 3, taskId: 0, taskPoints: 10, projectId: null })).toBeNull();
    expect(awardFromTaskCompletion).not.toHaveBeenCalled();
  });

  it("award que devolve nada é tratado como 'ninguém creditado'", async () => {
    const events = createTaskProgressEvents({
      awards: { awardFromTaskCompletion: async () => null },
    });

    expect(await events.onTaskCompleted({ userId: 3, taskId: 7, taskPoints: 10, projectId: null })).toBeNull();
  });
});

describe("tarefa de projeto concluída incrementa projects.points (V5-7b, DEC-63/74)", () => {
  it("incrementa pelo valor CREDITADO, com o projectId do evento", async () => {
    const incrementProjectPoints = vi.fn(async () => 120);
    const events = createTaskProgressEvents({
      awards: { awardFromTaskCompletion: async () => ({ pointsAwarded: 20 }) },
      projectPoints: { incrementProjectPoints },
    });

    const credited = await events.onTaskCompleted({ userId: 3, taskId: 7, taskPoints: 20, projectId: 9 });

    expect(credited).toBe(20);
    expect(incrementProjectPoints).toHaveBeenCalledWith(9, 20);
  });

  it("idempotência (creditado 0) NÃO escreve — o saldo não muda duas vezes", async () => {
    const incrementProjectPoints = vi.fn(async () => 100);
    const events = createTaskProgressEvents({
      awards: { awardFromTaskCompletion: async () => ({ pointsAwarded: 0, alreadyAwarded: true }) },
      projectPoints: { incrementProjectPoints },
    });

    await events.onTaskCompleted({ userId: 3, taskId: 7, taskPoints: 20, projectId: 9 });

    expect(incrementProjectPoints).not.toHaveBeenCalled();
  });

  it("quest global (projectId null) não toca em projeto nenhum", async () => {
    const incrementProjectPoints = vi.fn(async () => 100);
    const events = createTaskProgressEvents({
      awards: { awardFromTaskCompletion: async () => ({ pointsAwarded: 20 }) },
      projectPoints: { incrementProjectPoints },
    });

    await events.onTaskCompleted({ userId: 3, taskId: 7, taskPoints: 20, projectId: null });

    expect(incrementProjectPoints).not.toHaveBeenCalled();
  });

  it("negativo creditado passa ao adaptador — o piso 0 é da escrita do projeto (DEC-74)", async () => {
    const incrementProjectPoints = vi.fn(async () => 0);
    const events = createTaskProgressEvents({
      awards: { awardFromTaskCompletion: async () => ({ pointsAwarded: -50 }) },
      projectPoints: { incrementProjectPoints },
    });

    await events.onTaskCompleted({ userId: 3, taskId: 7, taskPoints: -50, projectId: 9 });

    expect(incrementProjectPoints).toHaveBeenCalledWith(9, -50);
  });

  it("falha do incremento não quebra a conclusão (mesmo quirk do award)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const events = createTaskProgressEvents({
      awards: { awardFromTaskCompletion: async () => ({ pointsAwarded: 20 }) },
      projectPoints: {
        incrementProjectPoints: async () => {
          throw new Error("projects fora do ar");
        },
      },
    });

    expect(await events.onTaskCompleted({ userId: 3, taskId: 7, taskPoints: 20, projectId: 9 })).toBe(20);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("publishTaskCompletionAward — falha de award não quebra a conclusão (congelado)", () => {
  it("award que estoura vira null, com o erro registrado", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const events = {
      onTaskCompleted: async () => {
        throw new Error("gamification fora do ar");
      },
    };

    const credited = await publishTaskCompletionAward(events, 3, 7, 10, null);

    expect(credited).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("publisher ausente devolve null — é o caminho do roundtrip G4", async () => {
    expect(await publishTaskCompletionAward(undefined, 3, 7, 10, 9)).toBeNull();
  });

  it("no caminho feliz devolve o creditado", async () => {
    const events = { onTaskCompleted: async () => 15 };

    expect(await publishTaskCompletionAward(events, 3, 7, 10, 9)).toBe(15);
  });
});