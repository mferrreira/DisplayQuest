import { Prisma } from "@prisma/client";

import { POINTS_AFTER_MONTH_CLOSE } from "@/backend/domain/gamification";
import type {
  MonthlyPointsCyclePort,
  MonthWindowInstants,
} from "@/backend/modules/gamification/application/ports/monthly-points-cycle.port";
import { prisma } from "@/lib/database/prisma";

/**
 * PrismaMonthlyPointsCyclePort — plan-v8 V8-2 (DEC-212). O fechamento mensal do placar.
 *
 * `countTasksCompletedInMonth` é duas queries porque o contador vitalício `users.completedTasks`
 * é incrementado em dois lugares diferentes e nenhum dos dois deixa rastro datado próprio além da
 * linha que escreve:
 *   - `task_user_progress.completedAt` — a conclusão individual no caminho pública/global
 *     (`complete-task.use-case.ts:113-119`);
 *   - `tasks.completedAt` com `assignedTo` e a MESMA condição do increment de `approve-task.use-case.ts:126`
 *     (`taskVisibility !== "public" && !isGlobal`) — a aprovação da tarefa delegada, que credita o
 *     responsável sem linha de progresso.
 * As duas famílias são disjuntas pela visibilidade, então a soma não conta duas vezes. É a medida
 * de hoje, congelada no roundtrip da onda; se o caminho de conclusão mudar, o roundtrip avisa.
 *
 * `closeMonth` escreve os dois lados num único `$transaction` (snapshot primeiro, zeragem por
 * último) e devolve `false` no conflito de unique: é o backstop da corrida, a leitura
 * `hasMonthSnapshot` do use case é o caminho normal da idempotência.
 */
export function createPrismaMonthlyPointsCyclePort(): MonthlyPointsCyclePort {
  return {
    async listAllUsersForClose() {
      const rows = await prisma.users.findMany({
        select: { id: true, name: true, points: true },
        orderBy: { id: "asc" },
      });
      return rows.map((row) => ({ userId: row.id, name: row.name, points: row.points }));
    },

    async countTasksCompletedInMonth(userId, { start, endExclusive }: MonthWindowInstants) {
      const [progressos, delegadasAprovadas] = await Promise.all([
        prisma.task_user_progress.count({
          where: { userId, completedAt: { gte: start, lt: endExclusive } },
        }),
        prisma.tasks.count({
          where: {
            assignedTo: userId,
            completedAt: { gte: start, lt: endExclusive },
            isGlobal: false,
            taskVisibility: { not: "public" },
          },
        }),
      ]);
      return progressos + delegadasAprovadas;
    },

    async hasMonthSnapshot(userId, month) {
      const existing = await prisma.month_history.findFirst({
        where: { userId, month },
        select: { id: true },
      });
      return Boolean(existing);
    },

    async closeMonth({ userId, month, points, completedTasksOfMonth }) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.month_history.create({
            data: { userId, month, points, completedTasks: completedTasksOfMonth },
          });
          await tx.users.update({
            where: { id: userId },
            data: { points: POINTS_AFTER_MONTH_CLOSE },
          });
        });
        return true;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return false;
        }
        throw error;
      }
    },
  };
}

