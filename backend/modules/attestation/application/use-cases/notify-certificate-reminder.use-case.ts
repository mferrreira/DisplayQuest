/**
 * NotifyCertificateReminderUseCase — lembrete mensal de atestados (V5-10b, DEC-72).
 *
 * O único chamador é a rotina do cron (`0 9 19 * *`, America/Sao_Paulo), que passa
 * `systemActor(CERTIFICATE_REMINDER)` — o ator é obrigatório porque a publicação desce
 * para o `publishEvent`, que checa permissão no ator (DEC-54). Não existe rota para este
 * use case de propósito: varredura de agenda não é ação de pessoa.
 *
 * O use case não decide o dia — o cron dispara só no dia 19 (DEC-72). O que ele decide é
 * a audiência por projeto: líder + COORDENADORES/GERENTES ATIVOS (DEC-55), e o mês
 * nomeado é o anterior ao da execução (DEC-171). Projeto sem destinatário não é notificado
 * (líder nulo e sem gestor global não tem quem receba). Falha de publicação vai pro log e
 * não quebra o restante do lote — mesmo quirk congelado da varredura de atraso.
 */
import {
  CERTIFICATE_REMINDER_TITLE,
  certificateReminderMessage,
  certificateReminderRecipients,
  civilDayOfInstant,
  previousMonth,
  type ActorRef,
} from "@/backend/domain";
import type { CertificateReminderNotifierPort } from "@/backend/modules/attestation/application/ports/certificate-reminder-notifier.port";
import type { CertificateReminderScanPort } from "@/backend/modules/attestation/application/ports/certificate-reminder-scan.port";

export interface NotifyCertificateReminderCommand {
  actor: ActorRef;
  /** `now` é parâmetro, nunca `new Date()` dentro da regra (DEC-132). */
  now: Date;
}

export interface NotifyCertificateReminderResult {
  projectsNotified: number;
  recipientsNotified: number;
}

export class NotifyCertificateReminderUseCase {
  constructor(
    private readonly ports: {
      scan: CertificateReminderScanPort;
      notifier: CertificateReminderNotifierPort;
    },
  ) {}

  async execute(command: NotifyCertificateReminderCommand): Promise<NotifyCertificateReminderResult> {
    const projects = await this.ports.scan.listProjectsForReminder();
    if (projects.length === 0) {
      return { projectsNotified: 0, recipientsNotified: 0 };
    }

    const referenceMonth = previousMonth(civilDayOfInstant(command.now));
    const globalManagerIds = await this.ports.scan.listGlobalManagerUserIds();

    let projectsNotified = 0;
    let recipientsNotified = 0;

    for (const project of projects) {
      const userIds = certificateReminderRecipients(project.leaderId, globalManagerIds);
      if (userIds.length === 0) continue;

      try {
        await this.ports.notifier.publishReminder(
          {
            projectId: project.projectId,
            userIds,
            title: CERTIFICATE_REMINDER_TITLE,
            message: certificateReminderMessage(project.projectName, referenceMonth),
          },
          command.actor,
        );
        projectsNotified += 1;
        recipientsNotified += userIds.length;
      } catch (error) {
        console.error(`⚠️ Não foi possível notificar o lembrete do projeto ${project.projectId}:`, error);
      }
    }

    return { projectsNotified, recipientsNotified };
  }
}
