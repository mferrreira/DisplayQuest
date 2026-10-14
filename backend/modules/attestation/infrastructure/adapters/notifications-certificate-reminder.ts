import { CERTIFICATE_REMINDER_NOTIFICATION_TYPE, type ActorRef } from "@/backend/domain";
import type {
  CertificateReminderNotification,
  CertificateReminderNotifierPort,
} from "@/backend/modules/attestation/application/ports/certificate-reminder-notifier.port";

/**
 * NotificationsCertificateReminderNotifier — V5-10b (DEC-21/72). O módulo de atestados
 * depende só da porta local; o composition root injeta o módulo de notificações, que
 * satisfaz a porta estruturalmente. Sem `priority`: o lembrete é aviso de agenda, não
 * alerta — o painel destaca pela flag, e aqui ela não existe.
 *
 * O ator atravessa a fronteira (não é fabricado aqui): quem declara a chamada como rotina
 * de sistema é o cron, com `systemActor(CERTIFICATE_REMINDER)` (DEC-54).
 */
export interface NotificationPublishSource {
  publishEvent(command: {
    eventType: string;
    title: string;
    message: string;
    audience: { mode: "USER_IDS"; userIds: number[] };
    priority?: boolean;
    actor: ActorRef;
  }): Promise<unknown>;
}

class NotificationsCertificateReminderNotifier implements CertificateReminderNotifierPort {
  constructor(private readonly source: NotificationPublishSource) {}

  async publishReminder(notification: CertificateReminderNotification, actor: ActorRef): Promise<void> {
    await this.source.publishEvent({
      eventType: CERTIFICATE_REMINDER_NOTIFICATION_TYPE,
      title: notification.title,
      message: notification.message,
      audience: { mode: "USER_IDS", userIds: notification.userIds },
      actor,
    });
  }
}

export function createNotificationsCertificateReminderNotifier(
  source: NotificationPublishSource,
): CertificateReminderNotifierPort {
  return new NotificationsCertificateReminderNotifier(source);
}

/**
 * Default da factory quando notificações não estão injetadas — NÃO é silencioso de
 * propósito (DEC-54): o composition root injeta o real; o default só existe para o factory
 * montar o módulo em testes que não exercitam o lembrete.
 */
export function createNoOpCertificateReminderNotifier(): CertificateReminderNotifierPort {
  return {
    async publishReminder(notification) {
      console.warn("certificateReminderNotifier não conectado — lembrete não notificado", notification);
    },
  };
}
