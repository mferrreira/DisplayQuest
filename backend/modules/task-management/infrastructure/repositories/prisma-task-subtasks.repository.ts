import { prisma } from "@/lib/database/prisma"
import type { ISubtask } from "@/backend/domain"
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository"

/**
 * PrismaTaskSubtasksRepository — plano-v4 · V4-4. Adaptador fino sobre `task_subtasks`.
 *
 * Ordem `id ASC` em todas as leituras: a ordem que a pessoa escreveu no formulário é a ordem
 * que ela vê. (`tasks` ordena `id DESC` porque o quadro é mais-novo-primeiro; a lista de
 * subtasks de uma mesma tarefa não é um quadro.)
 */
type SubtaskRow = {
  id: number
  taskId: number
  title: string
  completed: boolean
  completedAt: Date | null
  createdAt: Date
}

function toView(row: SubtaskRow): ISubtask {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    completed: row.completed,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
  }
}

export function createPrismaTaskSubtasksRepository(): TaskSubtasksPort {
  return {
    async listByTaskId(taskId) {
      const rows = await prisma.task_subtasks.findMany({
        where: { taskId },
        orderBy: { id: "asc" },
      })
      return rows.map(toView)
    },
    async listByTaskIds(taskIds) {
      const grouped = new Map<number, ISubtask[]>()
      if (taskIds.length === 0) return grouped
      const rows = await prisma.task_subtasks.findMany({
        where: { taskId: { in: taskIds } },
        orderBy: { id: "asc" },
      })
      for (const row of rows) {
        const list = grouped.get(row.taskId)
        if (list) list.push(toView(row))
        else grouped.set(row.taskId, [toView(row)])
      }
      return grouped
    },
    async findById(subtaskId) {
      const row = await prisma.task_subtasks.findUnique({ where: { id: subtaskId } })
      return row ? toView(row) : null
    },
    async countOpenByTaskId(taskId) {
      // Servido pelo índice `task_subtasks_taskId_completed_idx`.
      return await prisma.task_subtasks.count({ where: { taskId: taskId, completed: false } })
    },
    async create(taskId, title) {
      const row = await prisma.task_subtasks.create({ data: { taskId: taskId, title: title } })
      return toView(row)
    },
    async createMany(taskId, titles) {
      // `createMany` não devolve as linhas criadas; a leitura de volta mantém a ordem de criação
      // e devolve ao caso de uso a mesma forma que as outras operações devolvem.
      await prisma.task_subtasks.createMany({ data: titles.map((title) => ({ taskId: taskId, title: title })) })
      return await this.listByTaskId(taskId)
    },
    async update(subtaskId, data) {
      const row = await prisma.task_subtasks.update({ where: { id: subtaskId }, data })
      return toView(row)
    },
    async delete(subtaskId) {
      await prisma.task_subtasks.delete({ where: { id: subtaskId } })
    },
  }
}
