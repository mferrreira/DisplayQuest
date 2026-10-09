import type { ActorRef } from "@/backend/domain";

/**
 * Event shape the task use cases publish (TASK_REVIEW_REQUEST / TASK_APPROVED / TASK_REJECTED).
 *
 * D4/B6-2b (DEC-54): `actor` is required because the composition root wires the real notifications
 * module here (`root.ts:39`), and that module asserts MANAGE_NOTIFICATIONS since B6-2b. These
 * three events describe a review that ALREADY happened — there is no person to authorise, so the
 * task use cases pass a `systemActor("SYSTEM_EVENT")`. This is the fourth actor-less caller
 * family measured in B6-2b, alongside the two publishers and the cron.
 */
export interface TaskNotificationEvent {
  eventType: string
  title: string
  message: string
  data?: Record<string, unknown>
  triggeredByUserId?: number
  audience: { mode: "USER_IDS"; userIds: number[] }
  actor: ActorRef
}

/**
 * TaskNotificationsPort — OND4-B3 (R1). Local port the composition root wires the
 * notifications module into (cross-module only via composition root — SPEC §5).
 */
export interface TaskNotificationsPort {
  publishEvent(event: TaskNotificationEvent): Promise<unknown>
}
