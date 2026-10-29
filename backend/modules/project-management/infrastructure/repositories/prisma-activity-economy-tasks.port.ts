import { prisma } from "@/lib/database/prisma"
import type { ActivityEconomyTasksPort } from "@/backend/modules/project-management/application/ports/activity-economy-tasks.port"

/**
 * V5-7b (DEC-104/163) — matéria-prima da atribuição: tarefas CONCLUÍDAS do projeto com seus
 * participantes. Responsáveis saem de `task_assignees`; completadores de tarefa pública saem
 * de `task_user_progress` com `completedAt` escrito (é o que o fluxo de conclusão pública
 * grava). A deduplicação por par (membro, tarefa) NÃO é daqui — é `memberTaskCredits`, no
 * domínio (RG-04: o adaptador não decide).
 */
export function createPrismaActivityEconomyTasksPort(): ActivityEconomyTasksPort {
  return {
    async listCompletedTaskCredits(projectId: number) {
      const rows = await prisma.tasks.findMany({
        where: { projectId, completed: true },
        select: {
          id: true,
          assignees: { select: { userId: true } },
          taskProgress: {
            where: { completedAt: { not: null } },
            select: { userId: true },
          },
        },
        orderBy: { id: "asc" },
      })
      return rows.map((row) => ({
        taskId: row.id,
        assigneeIds: row.assignees.map((assignee) => assignee.userId),
        completerIds: row.taskProgress.map((progress) => progress.userId),
      }))
    },
  }
}
