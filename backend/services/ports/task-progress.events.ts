export interface TaskCompletedProgressEvent {
  userId: number
  taskId: number
  taskPoints: number
}

export interface TaskProgressEvents {
  onTaskCompleted(event: TaskCompletedProgressEvent): Promise<void>
}
