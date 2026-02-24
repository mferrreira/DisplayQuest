import { createGamificationModule, type GamificationModule } from "@/backend/modules/gamification"
import type {
  TaskCompletedEvent,
  TaskProgressEvents,
} from "@/backend/modules/task-management/application/ports/task-progress.events"

class GamificationTaskProgressEvents implements TaskProgressEvents {
  constructor(private readonly gamification: GamificationModule) {}

  async onTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    if (!event.userId || !event.taskId) {
      return
    }

    await this.gamification.awardFromTaskCompletion({
      userId: event.userId,
      taskId: event.taskId,
      taskPoints: event.taskPoints,
    })
  }
}

export function createTaskProgressEvents(dependencies: { gamificationModule?: GamificationModule } = {}): TaskProgressEvents {
  return new GamificationTaskProgressEvents(dependencies.gamificationModule ?? createGamificationModule())
}
