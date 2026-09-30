/**
 * OND8-B3 — porta LOCAL de publicação de eventos de issue (DEC-21: a infra do lab não
 * importa factory de outro módulo; a composition root cabula o adaptador que fala com o
 * módulo de notificações). Payloads congelados do gateway legado (golden 8.1).
 */
export interface LabIssuePublisherPort {
  publishIssueRaised(event: {
    issueId: number | undefined
    title: string
    priority: string
    reporterId: number
    recipientIds: number[]
  }): Promise<void>

  publishIssueAssigned(event: {
    issueId: number | undefined
    title: string
    priority: string
    assigneeId: number
  }): Promise<void>
}
