import { prisma } from "@/lib/database/prisma"
import type { ISubtask } from "@/backend/domain"
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository"

/**
 * PrismaTaskSubtasksRepository — plano-v4 · V4-4. Adaptador fino sobre `task_subtasks`.
 *
 * Ordem persistida `sortOrder ASC`, empate por `id ASC` (S09, R9). A ordem inicial é a ordem de
 * criação: `create` acrescenta no fim da lista, e a migration de 2026-10-29 deu às linhas
 * antigas `sortOrder = id`. (`tasks` ordena `id DESC` porque o quadro é mais-novo-primeiro; a
 * lista de subtasks de uma mesma tarefa não é um quadro.)
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
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      })
      return rows.map(toView)
    },
    async listByTaskIds(taskIds) {
      const grouped = new Map<number, ISubtask[]>()
      if (taskIds.length === 0) return grouped
      const rows = await prisma.task_subtasks.findMany({
        where: { taskId: { in: taskIds } },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
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
      // Anexar no fim da lista: `sortOrder` = quantidade de linhas que já existem.
      const tail = await prisma.task_subtasks.count({ where: { taskId } })
      const row = await prisma.task_subtasks.create({ data: { taskId: taskId, title: title, sortOrder: tail } })
      return toView(row)
    },
    async createMany(taskId, titles) {
      // `createMany` não devolve as linhas criadas; a leitura de volta mantém a ordem de criação
      // e devolve ao caso de uso a mesma forma que as outras operações devolvem.
      const tail = await prisma.task_subtasks.count({ where: { taskId } })
      await prisma.task_subtasks.createMany({
        data: titles.map((title, index) => ({ taskId: taskId, title: title, sortOrder: tail + index })),
      })
      return await this.listByTaskId(taskId)
    },
    async reorder(taskId, orderedIds) {
      // Uma transacção: a lista inteira muda de posição ou nada muda.
      await prisma.$transaction(
        orderedIds.map((id, index) =>
          prisma.task_subtasks.update({ where: { id }, data: { sortOrder: index } })
        )
      )
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
