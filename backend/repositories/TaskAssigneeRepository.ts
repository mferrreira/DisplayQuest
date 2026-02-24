import { prisma } from "@/lib/database/prisma"

export interface TaskAssigneeRecord {
  id: number
  taskId: number
  userId: number
  assignedBy: number | null
  assignedAt: Date
}

export class TaskAssigneeRepository {
  private get table() {
    return (prisma as any).task_assignees
  }

  private map(record: any): TaskAssigneeRecord {
    return {
      id: record.id,
      taskId: record.taskId,
      userId: record.userId,
      assignedBy: record.assignedBy ?? null,
      assignedAt: record.assignedAt,
    }
  }

  isAvailable() {
    return !!this.table
  }

  async listByTaskId(taskId: number): Promise<TaskAssigneeRecord[]> {
    if (!this.table) return []
    const rows = await this.table.findMany({
      where: { taskId },
      orderBy: { assignedAt: "asc" },
    })
    return rows.map((row: any) => this.map(row))
  }

  async listUserIdsByTaskId(taskId: number): Promise<number[]> {
    const rows = await this.listByTaskId(taskId)
    return rows.map((row) => row.userId)
  }

  async listTaskIdsByUserId(userId: number): Promise<number[]> {
    if (!this.table) return []
    const rows = await this.table.findMany({
      where: { userId },
      select: { taskId: true },
    })
    return rows.map((row: any) => Number(row.taskId)).filter((id: number) => !Number.isNaN(id))
  }

  async isUserAssigned(taskId: number, userId: number): Promise<boolean> {
    if (!this.table) return false
    const row = await this.table.findUnique({
      where: {
        taskId_userId: { taskId, userId },
      },
      select: { id: true },
    })
    return !!row
  }

  async replaceAssignees(taskId: number, userIds: number[], assignedBy?: number | null): Promise<void> {
    if (!this.table) {
      throw new Error("task_assignees indisponível. Rode prisma generate/migrate antes de usar multiatribuição.")
    }

    const normalized = Array.from(new Set(userIds.filter((id: number) => Number.isInteger(id) && id > 0)))
    await this.table.deleteMany({ where: { taskId } })

    if (normalized.length === 0) return

    await this.table.createMany({
      data: normalized.map((userId) => ({
        taskId,
        userId,
        assignedBy: assignedBy ?? null,
      })),
      skipDuplicates: true,
    })
  }
}
