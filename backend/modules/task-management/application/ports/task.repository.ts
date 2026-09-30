import type { ITask, Task } from "@/backend/domain"

/**
 * TaskRepositoryPort — OND4-B3 (R1). The task-table seam the use cases talk to.
 * `update` is a FULL replacement (the legacy TaskRepository.update writes task.toPrisma()
 * wholesale — frozen by the golden matrix), NOT a partial merge.
 */
export interface TaskRepositoryPort {
  findById(id: number): Promise<Task | null>
  findAll(): Promise<Task[]>
  findByAssigneeId(userId: number): Promise<Task[]>
  create(data: ITask): Promise<Task>
  update(id: number, data: ITask): Promise<Task>
  delete(id: number): Promise<void>
}
