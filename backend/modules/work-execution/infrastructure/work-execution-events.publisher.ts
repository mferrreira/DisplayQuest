import { createGamificationModule, GamificationModule } from "@/backend/modules/gamification"
import type {
  WorkExecutionEvents,
  WorkSessionCompletedEvent,
} from "@/backend/modules/work-execution/application/ports/work-execution.events"

export class WorkExecutionEventsPublisher implements WorkExecutionEvents {
  constructor(private readonly gamificationModule: GamificationModule) {}

  async onWorkSessionCompleted(event: WorkSessionCompletedEvent): Promise<void> {
    if (!event.session.id) return

    await this.gamificationModule.awardFromWorkSession({
      userId: event.session.userId,
      workSessionId: event.session.id,
      durationSeconds: event.session.duration,
      completedTaskIds: event.completedTaskIds,
    })

    if (!event.completedTaskIds?.length) return

    for (const taskId of event.completedTaskIds) {
      await this.gamificationModule.awardFromTaskCompletion({
        userId: event.session.userId,
        taskId,
      })
    }
  }
}

export function createWorkExecutionEventsPublisher(
  dependencies: { gamificationModule?: GamificationModule } = {},
) {
  return new WorkExecutionEventsPublisher(dependencies.gamificationModule ?? createGamificationModule())
}
