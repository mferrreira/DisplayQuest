import type {
  TaskCompletedEvent,
  TaskProgressEvents,
} from "@/backend/modules/task-management/application/ports/task-progress.events";

/**
 * TaskAwardPort — OND4-B3 (DEC-21 pattern, same as work-execution): the publisher depends
 * on this LOCAL port, not on the gamification module factory. The composition root wires
 * the gamification module in (cross-module only via composition root — SPEC §5), which
 * removes the last cross-module import from this module's infrastructure.
 */
export interface TaskAwardPort {
  awardFromTaskCompletion(input: { userId: number; taskId: number; taskPoints: number }): Promise<unknown>
}

class GamificationTaskProgressEvents implements TaskProgressEvents {
  constructor(private readonly awards: TaskAwardPort) {}

  async onTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    if (!event.userId || !event.taskId) {
      return
    }

    await this.awards.awardFromTaskCompletion({
      userId: event.userId,
      taskId: event.taskId,
      taskPoints: event.taskPoints,
    })
  }
}

export function createTaskProgressEvents(dependencies: { awards: TaskAwardPort }): TaskProgressEvents {
  return new GamificationTaskProgressEvents(dependencies.awards)
}
