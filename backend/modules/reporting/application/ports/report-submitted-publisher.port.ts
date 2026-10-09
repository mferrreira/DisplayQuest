/**
 * OND7-B3 — LOCAL publisher port for the report-submission event (DEC-21 pattern, same as
 * GamificationAwardsPort/TaskAwardPort in OND6). The reporting module depends ONLY on this
 * port; the composition root wires it to the notifications module. The legacy gateway
 * imported the notifications factory directly (allow-list entry, task OND9-B1).
 */
export interface ReportSubmittedEvent {
  reportId: number
  projectId: number
  authorId: number
  /** computeReportPeriod label (SP-anchored), NOT the read-model label (QUIRK-7E). */
  label: string
  projectName: string
  /** ACTIVE COORDENADOR/GERENTE recipients excluding the author (queried by the use case). */
  userIds: number[]
}

export interface ReportSubmittedPublisherPort {
  publishSubmitted(event: ReportSubmittedEvent): Promise<void>
}
