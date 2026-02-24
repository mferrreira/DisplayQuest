import { prisma } from "@/lib/database/prisma"

export type TaskProgressStatus = "to-do" | "in-progress" | "in-review" | "adjust" | "done"

export interface TaskUserProgressRecord {
  id: number
  taskId: number
  userId: number
  status: TaskProgressStatus
  pickedAt: Date | null
  completedAt: Date | null
  awardedPoints: number
  createdAt: Date
  updatedAt: Date
}

interface UpsertTaskUserProgressInput {
  taskId: number
  userId: number
  status: TaskProgressStatus
  pickedAt?: Date | null
  completedAt?: Date | null
  awardedPoints?: number
}

export class TaskUserProgressRepository {
  private get table() {
    return (prisma as any).task_user_progress
  }

  private map(record: any): TaskUserProgressRecord {
    return {
      id: record.id,
      taskId: record.taskId,
      userId: record.userId,
      status: record.status,
      pickedAt: record.pickedAt ?? null,
      completedAt: record.completedAt ?? null,
      awardedPoints: record.awardedPoints ?? 0,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  }

  isAvailable() {
    return !!this.table
  }

  async findByTaskAndUser(taskId: number, userId: number): Promise<TaskUserProgressRecord | null> {
    if (!this.table) return null
    const data = await this.table.findUnique({
      where: {
        taskId_userId: { taskId, userId },
      },
    })
    return data ? this.map(data) : null
  }

  async findByTaskIdsAndUser(taskIds: number[], userId: number): Promise<TaskUserProgressRecord[]> {
    if (!this.table || taskIds.length === 0) return []
    const data = await this.table.findMany({
      where: {
        taskId: { in: taskIds },
        userId,
      },
    })
    return data.map((record: any) => this.map(record))
  }

  async upsertForTaskUser(input: UpsertTaskUserProgressInput): Promise<TaskUserProgressRecord> {
    if (!this.table) {
      throw new Error("task_user_progress indisponível. Rode prisma generate/migrate antes de usar progresso individual.")
    }

    const data = await this.table.upsert({
      where: {
        taskId_userId: { taskId: input.taskId, userId: input.userId },
      },
      create: {
        taskId: input.taskId,
        userId: input.userId,
        status: input.status,
        pickedAt: input.pickedAt ?? null,
        completedAt: input.completedAt ?? null,
        awardedPoints: input.awardedPoints ?? 0,
      },
      update: {
        status: input.status,
        pickedAt: input.pickedAt,
        completedAt: input.completedAt,
        awardedPoints: input.awardedPoints,
      },
    })

    return this.map(data)
  }
}
