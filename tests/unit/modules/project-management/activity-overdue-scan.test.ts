/**
 * V5-8 (DEC-64) — varredura de atraso: `NotifyOverdueActivitiesUseCase`.
 *
 * O que fica congelado aqui (regras puras já presas em activity-overdue-rules.test.ts):
 *   1. Só atividade vencida vira notificação; a que ainda está no período não.
 *   2. UMA publicação por atividade, com `priority: true`, tipo/título do domínio e a
 *      mensagem medida; audiência = líder + gestores globais deduplicados.
 *   3. A marca `overdueNotifiedAt` só sai para as atividades cuja publicação DEU certo —
 *      falha de notificação deixa a linha para o próximo scan (não se perde aviso).
 *   4. Candidato sem destinatário nenhum não publica e não marca (retry quando alguém
 *      assumir o papel).
 *   5. Zero candidatos: nenhuma leitura de gestores, nenhuma marca, contagens zeradas.
 *   6. O ator passa pela porta de publicação (o cron chama com systemActor — DEC-54).
 */
import { describe, expect, it, vi } from "vitest";

import { systemActor } from "@/backend/domain";
import { NotifyOverdueActivitiesUseCase } from "@/backend/modules/project-management/application/use-cases/notify-overdue-activities.use-case";
import type {
  ActivityOverdueNotifierPort,
  ActivityOverdueNotification,
} from "@/backend/modules/project-management/application/ports/activity-overdue-notifier.port";
import type {
  ActivityOverdueScanPort,
  OverdueActivityCandidate,
} from "@/backend/modules/project-management/application/ports/activity-overdue-scan.port";

const NOW = new Date("2026-11-05T12:00:00.000Z"); // hoje civil: 2026-11-05

function candidate(overrides: Partial<OverdueActivityCandidate> = {}): OverdueActivityCandidate {
  return {
    id: 101,
    description: "Coleta de dados",
    firstMonth: "2026-10",
    lastMonth: "2026-10",
    projectName: "Pesquisa em IA",
    leaderId: 5,
    ...overrides,
  };
}

function scanPort(candidates: OverdueActivityCandidate[], managerIds: number[] = [2, 9]) {
  const marks: Array<{ ids: number[]; at: Date }> = [];
  const port: ActivityOverdueScanPort & { marks: typeof marks } = {
    async listNotificationCandidates() {
      return candidates;
    },
    async markOverdueNotified(activityIds, notifiedAt) {
      marks.push({ ids: [...activityIds], at: notifiedAt });
      return activityIds.length;
    },
    async listGlobalManagerUserIds() {
      return managerIds;
    },
    marks,
  };
  return port;
}

function notifierPort(failForActivityId: number | null = null) {
  const published: ActivityOverdueNotification[] = [];
  const actors: unknown[] = [];
  const port: ActivityOverdueNotifierPort & { published: typeof published; actors: unknown[] } = {
    published,
    actors,
    async publishOverdue(notification, actor) {
      if (failForActivityId !== null && notification.activityId === failForActivityId) {
        throw new Error("bucket fora do ar");
      }
      published.push(notification);
      actors.push(actor);
    },
  };
  return port;
}

describe("NotifyOverdueActivitiesUseCase (V5-8, DEC-64)", () => {
  it("publica uma notificação prioritária por atividade vencida, com a audiência medida", async () => {
    const scan = scanPort([candidate(), candidate({ id: 102, firstMonth: "2026-11", lastMonth: "2026-11" })]);
    const notifier = notifierPort();
    const useCase = new NotifyOverdueActivitiesUseCase({ scan, notifier });

    const result = await useCase.execute({ actor: systemActor("OVERDUE_SCAN"), now: NOW });

    // 101 venceu em 31/10; 102 termina em 30/11 — só a primeira é atraso.
    expect(result.notifiedActivities).toBe(1);
    expect(notifier.published).toHaveLength(1);
    expect(notifier.published[0]).toEqual({
      activityId: 101,
      userIds: [5, 2, 9],
      title: "Atividade atrasada",
      message:
        'A atividade "Coleta de dados" do projeto "Pesquisa em IA" venceu em 31/10/2026 e ainda não foi concluída.',
    });
    expect(result.recipientsNotified).toBe(3);
    // A marca sai depois da publicação, com o `now` do scan.
    expect(scan.marks).toEqual([{ ids: [101], at: NOW }]);
  });

  it("o ator da rotina chega à porta de publicação (DEC-54)", async () => {
    const scan = scanPort([candidate()]);
    const notifier = notifierPort();
    const useCase = new NotifyOverdueActivitiesUseCase({ scan, notifier });

    await useCase.execute({ actor: systemActor("OVERDUE_SCAN"), now: NOW });

    expect(notifier.actors).toHaveLength(1);
    expect((notifier.actors[0] as { reason?: string }).reason).toBe("OVERDUE_SCAN");
  });

  it("falha de publicação NÃO marca a linha — o próximo scan tenta de novo", async () => {
    const scan = scanPort([
      candidate(),
      candidate({ id: 102, firstMonth: "2026-09", lastMonth: "2026-09" }),
    ]);
    const notifier = notifierPort(101);
    const useCase = new NotifyOverdueActivitiesUseCase({ scan, notifier });

    const result = await useCase.execute({ actor: systemActor("OVERDUE_SCAN"), now: NOW });

    expect(result.notifiedActivities).toBe(1); // só a 102 conseguiu
    expect(notifier.published.map((n) => n.activityId)).toEqual([102]);
    expect(scan.marks).toEqual([{ ids: [102], at: NOW }]); // 101 ficou sem marca
  });

  it("sem destinatário nenhum: não publica e não marca", async () => {
    const scan = scanPort([candidate({ leaderId: null })], []);
    const notifier = notifierPort();
    const useCase = new NotifyOverdueActivitiesUseCase({ scan, notifier });

    const result = await useCase.execute({ actor: systemActor("OVERDUE_SCAN"), now: NOW });

    expect(notifier.published).toHaveLength(0);
    expect(scan.marks).toHaveLength(0);
    expect(result.notifiedActivities).toBe(0);
  });

  it("zero candidatos: nenhuma leitura de gestores, contagens zeradas", async () => {
    const scan = scanPort([]);
    const notifier = notifierPort();
    const useCase = new NotifyOverdueActivitiesUseCase({ scan, notifier });

    const result = await useCase.execute({ actor: systemActor("OVERDUE_SCAN"), now: NOW });

    expect(result).toEqual({ scanned: 0, notifiedActivities: 0, recipientsNotified: 0 });
    expect(notifier.published).toHaveLength(0);
    expect(scan.marks).toHaveLength(0);
  });

  it("líder que também é coordenador recebe UMA notificação (dedup da audiência)", async () => {
    const scan = scanPort([candidate({ leaderId: 2 })], [2, 9]);
    const notifier = notifierPort();
    const useCase = new NotifyOverdueActivitiesUseCase({ scan, notifier });

    const result = await useCase.execute({ actor: systemActor("OVERDUE_SCAN"), now: NOW });

    expect(notifier.published[0].userIds).toEqual([2, 9]);
    expect(result.recipientsNotified).toBe(2);
  });
});
