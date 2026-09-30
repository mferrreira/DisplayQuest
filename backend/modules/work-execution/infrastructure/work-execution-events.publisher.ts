import type { GamificationAwardsPort } from "@/backend/modules/work-execution/application/ports/gamification-awards.port"
import type {
  WorkExecutionEvents,
  WorkSessionCompletedEvent,
} from "@/backend/modules/work-execution/application/ports/work-execution.events"

/**
 * WorkExecutionEventsPublisher (OND3-B2) — pure dispatcher to the gamification awards port.
 * Behavior frozen by the golden matrix (OND3-B1):
 *   - session without id -> NO-OP;
 *   - awardFromWorkSession ALWAYS first, args passed verbatim (undefined completedTaskIds allowed);
 *   - task awards run sequentially after it, one per completedTaskIds entry; empty/undefined
 *     array -> no task awards.
 *
 * The dependency is now the LOCAL port `GamificationAwardsPort` — this file no longer imports
 * the gamification module (allow-list entry `rg04-infrastructure-work-execution` removed; the
 * composition root wires the gamification module into the port).
 */
export class WorkExecutionEventsPublisher implements WorkExecutionEvents {
  constructor(private readonly awards: GamificationAwardsPort) {}

  async onWorkSessionCompleted(event: WorkSessionCompletedEvent): Promise<void> {
    if (!event.session.id) return

    await this.awards.awardFromWorkSession({
      userId: event.session.userId,
      workSessionId: event.session.id,
      durationSeconds: event.session.duration,
      completedTaskIds: event.completedTaskIds,
    })

    if (!event.completedTaskIds?.length) return

    for (const taskId of event.completedTaskIds) {
      await this.awards.awardFromTaskCompletion({
        userId: event.session.userId,
        taskId,
      })
    }
  }
}

export function createWorkExecutionEventsPublisher(dependencies: { awards: GamificationAwardsPort }) {
  return new WorkExecutionEventsPublisher(dependencies.awards)
}
