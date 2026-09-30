import { prisma } from "@/lib/database/prisma"
import { toTaskView, type ITask } from "@/backend/domain"
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository"

/**
 * PrismaTaskRepository — OND4-B3 (R1) thin adapter over `tasks`.
 * Mirrors the legacy TaskRepository semantics that the golden matrix pinned:
 * findAll/findByAssigneeId order by id DESC; update is a FULL replacement (the toPrisma()
 * column set); no includes (the gateway never read the relation payloads — Task.fromPrisma
 * ignores them) and assigneeIds fall back to [assignedTo] (no taskAssignees include).
 */
function toRow(data: ITask) {
  return {
    title: data.title,
    description: data.description ?? null,
    status: data.status,
    priority: data.priority,
    assignedTo: data.assignedTo ?? null,
    projectId: data.projectId ?? null,
    dueDate: data.dueDate ?? null,
    points: data.points,
    completed: data.completed,
    completedAt: data.completedAt ?? null,
    taskVisibility: data.taskVisibility,
    isGlobal: data.isGlobal ?? false,
    groupTaskId: data.groupTaskId ?? null,
    createdBy: data.createdBy ?? null,
  }
}

type TaskRow = {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  assignedTo: number | null
  projectId: number | null
  dueDate: string | null
  points: number
  completed: boolean
  completedAt: Date | null
  taskVisibility: string
  isGlobal: boolean
  groupTaskId: number | null
  createdBy: number | null
}

function toView(row: TaskRow) {
  return toTaskView({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as ITask["status"],
    priority: row.priority as ITask["priority"],
    assignedTo: row.assignedTo,
    assigneeIds: row.assignedTo ? [row.assignedTo] : [],
    projectId: row.projectId,
    dueDate: row.dueDate,
    points: row.points,
    completed: row.completed,
    completedAt: row.completedAt,
    taskVisibility: row.taskVisibility as ITask["taskVisibility"],
    isGlobal: row.isGlobal,
    groupTaskId: row.groupTaskId,
    createdBy: row.createdBy,
  })
}

export function createPrismaTaskRepository(): TaskRepositoryPort {
  return {
    async findById(id) {
      const row = await prisma.tasks.findUnique({ where: { id } })
      return row ? toView(row) : null
    },
    async findAll() {
      const rows = await prisma.tasks.findMany({ orderBy: { id: "desc" } })
      return rows.map(toView)
    },
    async findByAssigneeId(userId) {
      const rows = await prisma.tasks.findMany({
        where: { assignedTo: userId },
        orderBy: { id: "desc" },
      })
      return rows.map(toView)
    },
    async create(data) {
      const row = await prisma.tasks.create({ data: toRow(data) })
      return toView(row)
    },
    async update(id, data) {
      const row = await prisma.tasks.update({ where: { id }, data: toRow(data) })
      return toView(row)
    },
    async delete(id) {
      await prisma.tasks.delete({ where: { id } })
    },
  }
}
