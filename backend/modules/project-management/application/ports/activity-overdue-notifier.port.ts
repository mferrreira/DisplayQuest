/**
 * ActivityOverdueNotifierPort — porta local de publicação da notificação de atraso
 * (V5-8, DEC-21/64). O módulo de projeto NÃO conhece o módulo de notificações: o
 * composition root injeta o adaptador que chama `publishEvent` com `priority: true`.
 *
 * O `actor` é parâmetro porque a única chamadora é a rotina do cron, que declara
 * `systemActor(OVERDUE_SCAN)` (lição DEC-54: rotina sem pessoa precisa de ator declarado,
 * senão o gate do `publishEvent` quebraria a rotina em produção).
 */
import type { ActorRef } from "@/backend/domain";

export interface ActivityOverdueNotification {
  activityId: number;
  userIds: number[];
  title: string;
  message: string;
}

export interface ActivityOverdueNotifierPort {
  publishOverdue(notification: ActivityOverdueNotification, actor: ActorRef): Promise<void>;
}
