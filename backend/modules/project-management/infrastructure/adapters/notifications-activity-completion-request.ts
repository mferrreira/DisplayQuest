import { ACTIVITY_COMPLETION_REQUEST_NOTIFICATION_TYPE, type ActorRef } from "@/backend/domain"
import type { NotificationPublishSource } from "@/backend/modules/project-management/infrastructure/adapters/notifications-activity-overdue"
import type {
  ActivityCompletionRequestNotifierPort,
  CompletionRequestNotification,
} from "@/backend/modules/project-management/application/ports/activity-completion-request-notifier.port"

/**
 * NotificationsActivityCompletionRequestNotifier — fix 4 (2026-10-28). Espelho do notificador de
 * atraso: o módulo de projeto depende só da porta local; o composition root injeta o módulo de
 * notificações. A prioridade é `true` — a solicitação é o que a gestão tem que ver primeiro.
 *
 * O ator atravessa a fronteira (não é fabricado aqui): quem declara que a chamada é rotina de
 * sistema é o use case, com `systemActor(SYSTEM_EVENT)` (DEC-54).
 */
class NotificationsActivityCompletionRequestNotifier implements ActivityCompletionRequestNotifierPort {
  constructor(private readonly source: NotificationPublishSource) {}

  async publishRequest(notification: CompletionRequestNotification, actor: ActorRef): Promise<void> {
    await this.source.publishEvent({
      eventType: ACTIVITY_COMPLETION_REQUEST_NOTIFICATION_TYPE,
      title: notification.title,
      message: notification.message,
      audience: { mode: "USER_IDS", userIds: notification.userIds },
      priority: true,
      actor,
    })
  }
}

export function createNotificationsActivityCompletionRequestNotifier(
  source: NotificationPublishSource,
): ActivityCompletionRequestNotifierPort {
  return new NotificationsActivityCompletionRequestNotifier(source)
}

/**
 * Default da factory quando notificações não estão injetadas — NÃO é silencioso de propósito
 * (DEC-54). O composition root injeta o real; este default só existe para o factory montar o
 * módulo sem notificações em testes que não exercitam a solicitação.
 */
export function createNoOpActivityCompletionRequestNotifier(): ActivityCompletionRequestNotifierPort {
  return {
    async publishRequest(notification) {
      console.warn("activityCompletionRequestNotifier não conectado — solicitação não notificada", notification)
    },
  }
}
