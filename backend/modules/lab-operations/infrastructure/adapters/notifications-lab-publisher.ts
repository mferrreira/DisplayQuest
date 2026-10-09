import { systemActor, type ActorRef } from "@/backend/domain/identity"
import type { LabIssuePublisherPort } from "@/backend/modules/lab-operations/application/ports/lab-issue-publisher.port"

/**
 * OND8-B3 — adaptador que cabula a porta LOCAL LabIssuePublisherPort no modulo de
 * notificacoes (DEC-21: a infra do lab NAO importa factory de outro modulo; a
 * composition root injeta o sink). Payloads LAB_ISSUE_RAISED / LAB_ISSUE_ASSIGNED
 * VERBATIM do gateway legado (golden 8.1).
 *
 * D4/B6-2b (DEC-54): o sink passou a exigir `actor`. Uma issue reportada e uma issue atribuida
 * sao fatos que JA ACONTECERAM — nao ha pessoa a autorizar, e o modulo de notificacoes passou a
 * exigir MANAGE_NOTIFICATIONS para quem publica. O `systemActor` e o motivo declarado disso; sem
 * ele, toda notificacao de issue passaria a levar 403 e o laboratorio emudeceria.
 */
export interface LabEventPublishSink {
  publishEvent(event: {
    eventType: string
    title: string
    message: string
    data: Record<string, unknown>
    audience: { mode: "USER_IDS"; userIds: number[] }
    triggeredByUserId?: number
    actor: ActorRef
  }): Promise<unknown>
}

export class NotificationsLabPublisher implements LabIssuePublisherPort {
  constructor(private readonly sink: LabEventPublishSink) {}

  async publishIssueRaised(event: {
    issueId: number | undefined
    title: string
    priority: string
    reporterId: number
    recipientIds: number[]
  }): Promise<void> {
    await this.sink.publishEvent({
      eventType: "LAB_ISSUE_RAISED",
      title: "Nova issue do laboratório",
      message: `A issue "${event.title}" foi reportada e precisa de acompanhamento.`,
      data: {
        issueId: event.issueId,
        title: event.title,
        priority: event.priority,
        reporterId: event.reporterId,
      },
      audience: { mode: "USER_IDS", userIds: event.recipientIds },
      triggeredByUserId: event.reporterId,
      actor: systemActor("SYSTEM_EVENT"),
    })
  }

  async publishIssueAssigned(event: {
    issueId: number | undefined
    title: string
    priority: string
    assigneeId: number
  }): Promise<void> {
    await this.sink.publishEvent({
      eventType: "LAB_ISSUE_ASSIGNED",
      title: "Issue atribuída a você",
      message: `Você foi designado para resolver a issue "${event.title}".`,
      data: {
        issueId: event.issueId,
        title: event.title,
        priority: event.priority,
      },
      audience: { mode: "USER_IDS", userIds: [event.assigneeId] },
      actor: systemActor("SYSTEM_EVENT"),
    })
  }
}
