import type { WorkSession } from "@/backend/models/WorkSession"

export interface WorkSessionCompletedEvent {
  session: WorkSession
  completedTaskIds?: number[]
}

export interface WorkExecutionEvents {
  onWorkSessionCompleted(event: WorkSessionCompletedEvent): Promise<void>
}
