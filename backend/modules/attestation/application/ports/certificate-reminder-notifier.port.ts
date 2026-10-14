/**
 * CertificateReminderNotifierPort — porta local de publicação do lembrete de frequência
 * (V5-10b, DEC-21/72). O módulo de atestados NÃO conhece o módulo de notificações: o
 * composition root injeta o adaptador que chama `publishEvent`.
 *
 * Diferente do atraso (DEC-64), o lembrete NÃO sai com `priority` — é aviso de agenda,
 * não alerta; o painel destaca pela flag, e aqui ela não existe. O `actor` atravessa a
 * fronteira: quem declara a rotina de sistema é o cron, com `systemActor(CERTIFICATE_REMINDER)`
 * (lição DEC-54).
 */
import type { ActorRef } from "@/backend/domain";

export interface CertificateReminderNotification {
  projectId: number;
  userIds: number[];
  title: string;
  message: string;
}

export interface CertificateReminderNotifierPort {
  publishReminder(notification: CertificateReminderNotification, actor: ActorRef): Promise<void>;
}
