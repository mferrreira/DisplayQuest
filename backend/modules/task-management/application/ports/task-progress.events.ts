export interface TaskCompletedEvent {
  userId: number;
  taskId: number;
  taskPoints: number;
}

export interface TaskProgressEvents {
  onTaskCompleted(event: TaskCompletedEvent): Promise<void>;
}
