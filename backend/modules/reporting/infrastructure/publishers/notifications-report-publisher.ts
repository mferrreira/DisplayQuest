import {
  REPORT_SUBMISSION_EVENT,
  reportSubmissionMessage,
} from "@/backend/domain/reporting"
import type {
  ReportSubmittedEvent,
  ReportSubmittedPublisherPort,
} from "@/backend/modules/reporting/application/ports/report-submitted-publisher.port"

/**
 * Minimal structural view of the notifications module (the ONLY thing this adapter needs).
 * Declared locally so the reporting infrastructure never imports another module's factory
 * (RG-04 / DEC-21 — the composition root wires the real module here).
 */
export interface ReportSubmittedEventSink {
  publishEvent(event: {
    eventType: string
    title: string
    message: string
    data: Record<string, unknown>
    audience: { mode: "USER_IDS"; userIds: number[] }
    triggeredByUserId?: number
  }): Promise<unknown>
}

/**
 * OND7-B3 — publisher adapter: builds the frozen PROJECT_REPORT_SUBMITTED payload
 * (gateway:750-757) and forwards it to the sink. Recipient lookup + failure swallowing
 * live in the use case (frozen behavior), not here.
 */
export class NotificationsReportPublisher implements ReportSubmittedPublisherPort {
  constructor(private readonly sink: ReportSubmittedEventSink) {}

  async publishSubmitted(event: ReportSubmittedEvent): Promise<void> {
    await this.sink.publishEvent({
      eventType: REPORT_SUBMISSION_EVENT.eventType,
      title: REPORT_SUBMISSION_EVENT.title,
      message: reportSubmissionMessage(event.label, event.projectName),
      data: { reportId: event.reportId, projectId: event.projectId },
      audience: { mode: "USER_IDS", userIds: event.userIds },
      triggeredByUserId: event.authorId,
    })
  }
}
