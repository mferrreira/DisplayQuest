/**
 * NotifyOverdueActivitiesUseCase — varredura diária de atraso (V5-8, DEC-64).
 *
 * O único chamador é a rotina do cron (`lib/services/cron-service.ts`), que passa
 * `systemActor(OVERDUE_SCAN)` — o ator é obrigatório porque a publicação desce para o
 * `publishEvent`, que checa permissão no ator (lição DEC-54: rotina sem pessoa precisa
 * declarar o ator-de-sistema, senão a rotina quebra em produção e nenhum teste de rota
 * exercita a quebra). Não existe rota para este use case de propósito: varredura não é
 * ação de pessoa.
 *
 * A guarda de "uma notificação por atividade" é a coluna `overdueNotifiedAt`: a porta só
 * entrega candidatos nunca-notificados, e a marca sai DEPOIS da publicação bem-sucedida —
 * falha de notificação deixa a linha viva para o scan do dia seguinte (perder aviso é
 * pior que repetir scan). Candidato sem destinatário também não é marcado: quando alguém
 * assumir o líder ou um papel global, o aviso sai.
 */
import {
  ACTIVITY_OVERDUE_TITLE,
  activityOverdueMessage,
  activityPeriod,
  civilDayOfInstant,
  isActivityOverdue,
  overdueNotificationRecipients,
  type ActorRef,
} from "@/backend/domain";
import type {
  ActivityOverdueNotifierPort,
} from "@/backend/modules/project-management/application/ports/activity-overdue-notifier.port";
import type {
  ActivityOverdueScanPort,
} from "@/backend/modules/project-management/application/ports/activity-overdue-scan.port";

export interface NotifyOverdueActivitiesCommand {
  actor: ActorRef;
  /** `now` é parâmetro, nunca `new Date()` dentro da regra (regra da casa, DEC-132). */
  now: Date;
}

export interface NotifyOverdueActivitiesResult {
  scanned: number;
  notifiedActivities: number;
  recipientsNotified: number;
}

export class NotifyOverdueActivitiesUseCase {
  constructor(
    private readonly ports: {
      scan: ActivityOverdueScanPort;
      notifier: ActivityOverdueNotifierPort;
    },
  ) {}

  async execute(command: NotifyOverdueActivitiesCommand): Promise<NotifyOverdueActivitiesResult> {
    const candidates = await this.ports.scan.listNotificationCandidates();
    const today = civilDayOfInstant(command.now);
    const overdue = candidates.filter((candidate) => isActivityOverdue(candidate, today));

    if (overdue.length === 0) {
      return { scanned: candidates.length, notifiedActivities: 0, recipientsNotified: 0 };
    }

    const globalManagerIds = await this.ports.scan.listGlobalManagerUserIds();

    const notifiedIds: number[] = [];
    let recipientsNotified = 0;

    for (const activity of overdue) {
      const userIds = overdueNotificationRecipients(activity.leaderId, globalManagerIds);
      if (userIds.length === 0) continue;

      const { periodoFim } = activityPeriod(activity.firstMonth, activity.lastMonth);
      try {
        await this.ports.notifier.publishOverdue(
          {
            activityId: activity.id,
            userIds,
            title: ACTIVITY_OVERDUE_TITLE,
            message: activityOverdueMessage(activity.projectName, activity.description, periodoFim),
          },
          command.actor,
        );
        notifiedIds.push(activity.id);
        recipientsNotified += userIds.length;
      } catch (error) {
        // Falha de crédito vai pro log e não quebra a varredura (quirk congelado do
        // caminho de tarefa): a linha fica sem marca e o próximo scan tenta de novo.
        console.error(`⚠️ Não foi possível notificar o atraso da atividade ${activity.id}:`, error);
      }
    }

    if (notifiedIds.length > 0) {
      await this.ports.scan.markOverdueNotified(notifiedIds, command.now);
    }

    return {
      scanned: candidates.length,
      notifiedActivities: notifiedIds.length,
      recipientsNotified,
    };
  }
}
