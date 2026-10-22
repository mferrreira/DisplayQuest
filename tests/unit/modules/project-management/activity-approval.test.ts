// @vitest-environment node
/**
 * V5-7b (DEC-63/74/76/77/103/104/163/164/165) — o use case de aprovar sobre portas falsas.
 *
 * Diferença medida em relação ao teste de rota: aqui o `now` entra por parâmetro, então a
 * economia é determinística — prêmio antecipado, no prazo e atrasado são provados com datas
 * fixas, não com o relógio da máquina (a rota usa `new Date()` e por isso congela só o ramo
 * que não depende do dia).
 *
 * O que este arquivo congela:
 *   1. A ordem das recusas: 404 projeto → 404 atividade → 403 gate → 409 status (o gate da
 *      fase 2 precisa do `requestedBy`, por isso desceu depois do 404 da atividade).
 *   2. O gate (DEC-76/77): só global manager; GERENTE não aprova o que pediu; COORDENADOR sim.
 *   3. A economia com `now` fixo: ×1,5 antecipada, base no prazo, −10%/dia, piso 0 (DEC-103/74).
 *   4. A ordem das escritas (DEC-165, ajustada na V8-1 pelo DEC-215): prêmios → transição. A
 *      transição é o commit; tudo antes dela é re-executável. O `projects.points` que ficava no
 *      meio saiu junto da coluna — não há saldo de projeto a subir.
 *   5. Idempotência e falha de crédito não quebram a conclusão (quirk congelado do tarefa).
 *   6. O edge medido da DEC-165: crédito já registrado (share 0) NÃO impede a conclusão — quem
 *      garante "uma vez só" é a transição de status, não o awardHistory.
 */
import { describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "@/backend/domain";
import type { Role } from "@/backend/domain";
import { ApproveActivityCompletionUseCase } from "@/backend/modules/project-management/application/use-cases/approve-activity-completion.use-case";
import type { ProjectRecord } from "@/backend/modules/project-management/application/ports/project.repository";
import type { ProjectActivityRecord } from "@/backend/modules/project-management/application/ports/project-cronograma.repository";

function projectRow(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 10,
    name: "Pesquisa em IA",
    description: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    createdBy: 1,
    leaderId: 2,
    status: "active",
    links: null,
    logoKey: null,
    bannerKey: null,
    ...overrides,
  };
}

function activityRow(overrides: Partial<ProjectActivityRecord> = {}): ProjectActivityRecord {
  return {
    id: 1,
    projectId: 10,
    order: 1,
    description: "Etapa 1",
    responsibleId: null,
    firstMonth: "2026-04",
    lastMonth: "2026-06",
    status: "COMPLETION_REQUESTED",
    requestedBy: 2,
    requestedAt: "2026-06-20T12:00:00.000Z",
    approvedBy: null,
    approvedAt: null,
    overdueNotifiedAt: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...overrides,
  };
}

class Store {
  project: ProjectRecord | null = projectRow();
  activity: ProjectActivityRecord | null = activityRow();
  activeMembers: number[] = [2, 3];
  completedTasks = [
    { taskId: 501, assigneeIds: [2], completerIds: [] },
    { taskId: 502, assigneeIds: [2, 3], completerIds: [3] },
  ];
  /** Chaves já creditadas — o duplo do awardHistory: segunda chamada devolve 0. */
  awarded = new Set<string>();
  calls: string[] = [];
  awardOutcomes: Array<{ userId: number; activityId: number; points: number }> = [];
  awardFails = false;

  useCase(): ApproveActivityCompletionUseCase {
    const self = this;
    return new ApproveActivityCompletionUseCase({
      projects: {
        async findById() {
          return self.project ? { ...self.project } : null;
        },
      } as never,
      cronograma: {
        async findActivityById() {
          return self.activity ? { ...self.activity } : null;
        },
        async approveActivity(id: number, fields: { status: string; approvedBy: number; approvedAt: Date }) {
          self.calls.push(`approveActivity:${id}:${fields.status}`);
          if (!self.activity) throw new Error("atividade ausente");
          self.activity = {
            ...self.activity,
            status: fields.status,
            approvedBy: fields.approvedBy,
            approvedAt: fields.approvedAt.toISOString(),
          };
          return { ...self.activity };
        },
      } as never,
      memberships: {
        async listActiveMemberUserIds() {
          return [...self.activeMembers];
        },
      } as never,
      economyTasks: {
        async listCompletedTaskCredits() {
          return [...self.completedTasks];
        },
      } as never,
      awards: {
        async awardActivityCompletion(input) {
          self.calls.push(`award:${input.userId}:${input.activityId}:${input.points}`);
          if (self.awardFails) {
            throw new Error("gamification fora do ar");
          }
          const key = `${input.userId}:${input.activityId}`;
          if (self.awarded.has(key)) {
            return { pointsAwarded: 0 };
          }
          self.awarded.add(key);
          self.awardOutcomes.push(input);
          return { pointsAwarded: input.points };
        },
      },
    });
  }

  async approve(overrides: { actorId?: number; actorRoles?: Role[]; now?: string } = {}) {
    return await this.useCase().execute({
      projectId: 10,
      activityId: 1,
      actorId: overrides.actorId ?? 1,
      actorRoles: overrides.actorRoles ?? ["COORDENADOR"],
      now: new Date(overrides.now ?? "2026-06-28T12:00:00.000Z"),
    });
  }
}

describe("ApproveActivityCompletionUseCase — recusas na ordem medida (DEC-76/77/162)", () => {
  it("projeto ausente: 404 antes de tudo", async () => {
    const store = new Store();
    store.project = null;
    await expect(store.approve()).rejects.toBeInstanceOf(NotFoundError);
    expect(store.calls).toHaveLength(0);
  });

  it("atividade ausente ou de outro projeto: 404", async () => {
    const store = new Store();
    store.activity = null;
    await expect(store.approve()).rejects.toThrow("Atividade não encontrada");

    const other = new Store();
    other.activity = activityRow({ projectId: 99 });
    await expect(other.approve()).rejects.toThrow("Atividade não encontrada");
  });

  it("gate (DEC-76/77): GERENTE não aprova o que pediu; COORDENADOR aprova; demais 403", async () => {
    const gerenteSelf = new Store();
    gerenteSelf.activity = activityRow({ requestedBy: 1 });
    await expect(
      gerenteSelf.approve({ actorId: 1, actorRoles: ["GERENTE"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(gerenteSelf.calls).toHaveLength(0);

    const coordenadorSelf = new Store();
    coordenadorSelf.activity = activityRow({ requestedBy: 1 });
    const ok = await coordenadorSelf.approve({ actorId: 1, actorRoles: ["COORDENADOR"] });
    expect(ok.activity.status).toBe("DONE");

    const liderSemPapelGlobal = new Store();
    await expect(liderSemPapelGlobal.approve({ actorId: 2, actorRoles: ["VOLUNTARIO"] })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    const semPapel = new Store();
    await expect(semPapel.approve({ actorId: 2, actorRoles: [] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("409 por status com a frase do domínio — OPEN e DONE", async () => {
    const open = new Store();
    open.activity = activityRow({ status: "OPEN" });
    await expect(open.approve()).rejects.toBeInstanceOf(ConflictError);
    await expect(open.approve()).rejects.toThrow("A conclusão desta atividade ainda não foi solicitada");

    const done = new Store();
    done.activity = activityRow({ status: "DONE" });
    await expect(done.approve()).rejects.toThrow("Esta atividade já foi concluída");
    expect(done.calls).toHaveLength(0);
  });
});

describe("ApproveActivityCompletionUseCase — economia com now fixo (DEC-103/74/104/163/164)", () => {
  // Atividade abr–jun/2026: base 300, prazo 2026-06-30. Créditos do seed: 2 → 2, 3 → 1.

  it("antecipada ≥2 dias: ×1,5 e distribuição 200/100; ordem das escritas DEC-165", async () => {
    const store = new Store();
    const result = await store.approve({ now: "2026-06-28T12:00:00.000Z" });

    expect(result.award).toBe(450);
    expect(result.shares).toEqual([
      { userId: 2, points: 300 },
      { userId: 3, points: 150 },
    ]);
    expect(result.activity.status).toBe("DONE");
    expect(result.activity.approvedBy).toBe(1);
    expect(result.activity.approvedAt).toBe("2026-06-28T12:00:00.000Z");

    // DEC-165 (V8-1): prêmios primeiro, transição por último (o ponto de commit).
    expect(store.calls).toEqual([
      "award:2:1:300",
      "award:3:1:150",
      "approveActivity:1:DONE",
    ]);
  });

  it("no prazo é a base cheia; atraso cobra 10%/dia; piso 0 zera o crédito", async () => {
    const onTime = new Store();
    expect((await onTime.approve({ now: "2026-06-30T12:00:00.000Z" })).award).toBe(300);

    const late = new Store();
    expect((await late.approve({ now: "2026-07-02T12:00:00.000Z" })).award).toBe(240);

    const floored = new Store();
    const result = await floored.approve({ now: "2026-08-01T12:00:00.000Z" });
    expect(result.award).toBe(0);
    // Prêmio 0: ninguém é chamado, mas a transição acontece.
    expect(result.shares).toEqual([]);
    expect(storeCalls(floored)).toEqual(["approveActivity:1:DONE"]);
  });

  it("membro INATIVO (fora da lista ativa) não entra na conta; sem membros, nada é creditado", async () => {
    const store = new Store();
    store.activeMembers = [2];
    const result = await store.approve();
    // Denominador da conta é a soma dos créditos dos que entram (DEC-165): só o membro 2 → 100% dele.
    expect(result.shares).toEqual([{ userId: 2, points: 450 }]);

    const nobody = new Store();
    nobody.activeMembers = [];
    const empty = await nobody.approve();
    expect(empty.shares).toEqual([]);
    // O prêmio existe e é distribuído (450) mesmo sem ninguém para recebê-lo.
    expect(empty.award).toBe(450);
    expect(storeCalls(nobody)).toEqual(["approveActivity:1:DONE"]);
  });

  it("denominador 0 (membros sem tasks): divisão igual pela mesma aritmética Hamilton", async () => {
    const store = new Store();
    store.completedTasks = [];
    const result = await store.approve();
    // 450 entre 2 membros: 225/225 exatos.
    expect(result.shares).toEqual([
      { userId: 2, points: 225 },
      { userId: 3, points: 225 },
    ]);
  });

  it("crédito já registrado (idempotência) devolve 0 na share e a conclusão acontece mesmo assim (edge DEC-165)", async () => {
    const store = new Store();
    store.awarded.add("2:1");
    store.awarded.add("3:1");
    const result = await store.approve();

    expect(result.shares).toEqual([
      { userId: 2, points: 0 },
      { userId: 3, points: 0 },
    ]);
    // Quem garante "uma vez só" é a transição de status (409 na reexecução), não o awardHistory.
    expect(result.activity.status).toBe("DONE");
    // O que a share diz é o CREDITADO (0), não o pedido (300/150) — o pedido é o que o award recebe.
    expect(store.calls).toEqual([
      "award:2:1:300",
      "award:3:1:150",
      "approveActivity:1:DONE",
    ]);
  });

  it("falha de crédito não quebra a conclusão (quirk congelado do caminho de tarefa)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new Store();
    store.awardFails = true;
    const result = await store.approve();

    expect(result.activity.status).toBe("DONE");
    expect(result.shares).toEqual([
      { userId: 2, points: 0 },
      { userId: 3, points: 0 },
    ]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

function storeCalls(store: Store): string[] {
  return store.calls;
}
