import { createGamificationModule, type GamificationModule } from "@/backend/modules/gamification"
import type {
  TaskCompletedProgressEvent,
  TaskProgressEvents,
} from "@/backend/services/ports/task-progress.events"

export class GamificationTaskProgressEvents implements TaskProgressEvents {
  constructor(private readonly gamificationModule: GamificationModule) {}

  async onTaskCompleted(event: TaskCompletedProgressEvent): Promise<void> {
    await this.gamificationModule.awardFromTaskCompletion({
      userId: event.userId,
      taskId: event.taskId,
      taskPoints: event.taskPoints,
    })
  }
}

export function createTaskProgressEvents() {
  return new GamificationTaskProgressEvents(createGamificationModule())
}
