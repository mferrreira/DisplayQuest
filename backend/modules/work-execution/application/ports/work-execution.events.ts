import type { WorkSession } from "@/backend/domain"

export interface WorkSessionCompletedEvent {
  session: WorkSession
  completedTaskIds?: number[]
}

export interface WorkExecutionEvents {
  onWorkSessionCompleted(event: WorkSessionCompletedEvent): Promise<void>
}
