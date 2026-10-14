import { ACTIVITY_OVERDUE_NOTIFICATION_TYPE, type ActorRef } from "@/backend/domain"
import type {
  ActivityOverdueNotification,
  ActivityOverdueNotifierPort,
} from "@/backend/modules/project-management/application/ports/activity-overdue-notifier.port"

/**
 * NotificationsActivityOverdueNotifier — V5-8 (DEC-21/64). O módulo de projeto depende só
 * da porta local; o composition root injeta o módulo de notificações, que satisfaz a porta
 * estruturalmente. A publicação sai com `priority: true` — é o que o painel destaca.
 *
 * O ator atravessa a fronteira (não é fabricado aqui): quem declara que a chamada é
 * rotina de sistema é o cron, com `systemActor(OVERDUE_SCAN)` (DEC-54).
 */
export interface NotificationPublishSource {
  publishEvent(command: {
    eventType: string
    title: string
    message: string
    audience: { mode: "USER_IDS"; userIds: number[] }
    priority?: boolean
    actor: ActorRef
  }): Promise<unknown>
}

class NotificationsActivityOverdueNotifier implements ActivityOverdueNotifierPort {
  constructor(private readonly source: NotificationPublishSource) {}

  async publishOverdue(notification: ActivityOverdueNotification, actor: ActorRef): Promise<void> {
    await this.source.publishEvent({
      eventType: ACTIVITY_OVERDUE_NOTIFICATION_TYPE,
      title: notification.title,
      message: notification.message,
      audience: { mode: "USER_IDS", userIds: notification.userIds },
      priority: true,
      actor,
    })
  }
}

export function createNotificationsActivityOverdueNotifier(
  source: NotificationPublishSource,
): ActivityOverdueNotifierPort {
  return new NotificationsActivityOverdueNotifier(source)
}

/**
 * Default da factory quando notificações não estão injetadas — NÃO é silencioso de
 * propósito (DEC-54). O composition root injeta o real; este default só existe para o
 * factory montar o módulo sem notificações em testes que não exercitam a varredura.
 */
export function createNoOpActivityOverdueNotifier(): ActivityOverdueNotifierPort {
  return {
    async publishOverdue(notification) {
      console.warn("activityOverdueNotifier não conectado — atraso não notificado", notification)
    },
  }
}
