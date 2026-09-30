/** Event shape the task use cases publish (TASK_REVIEW_REQUEST / TASK_APPROVED / TASK_REJECTED). */
export interface TaskNotificationEvent {
  eventType: string
  title: string
  message: string
  data?: Record<string, unknown>
  triggeredByUserId?: number
  audience: { mode: "USER_IDS"; userIds: number[] }
}

/**
 * TaskNotificationsPort — OND4-B3 (R1). Local port the composition root wires the
 * notifications module into (cross-module only via composition root — SPEC §5).
 */
export interface TaskNotificationsPort {
  publishEvent(event: TaskNotificationEvent): Promise<unknown>
}
