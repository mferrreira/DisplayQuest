import { prisma } from "@/lib/database/prisma";

import type { MonthWindowInstants } from "@/backend/modules/gamification/application/ports/monthly-points-cycle.port";
import type {
  MonthlyRankingPort,
  MonthlyRankingRow,
} from "@/backend/modules/gamification/application/ports/monthly-ranking.port";

/**
 * PrismaMonthlyRankingPort — plan-v8 V8-7 (DEC-220). O quadro do mês em curso, em quatro queries.
 *
 * As duas contagens de tarefa são as DUAS FAMÍLIAS com as MESMAS condições do fechamento mensal
 * (V8-2), da revisão semanal de XP (V8-3) e do critério de troféu (V8-6) — a janela `[start,
 * endExclusive)`, o `isGlobal: false` e o `taskVisibility: { not: "public" }` que impedem a tarefa
 * pública atribuída de entrar nas duas queries e crescer o número. `trophy-window-guard.test.ts`
 * confere as condições por texto; `monthly-ranking-roundtrip.test.ts` confere o número contra o
 * banco 5433, comparando o lote com a contagem por pessoa do mesmo mês.
 *
 * A diferença para os outros três adaptadores é o `groupBy` no lugar do `count` por pessoa: o quadro
 * é leitura de tela e não pode custar duas queries por cadastro. O lote agrupa por dono
 * (`by: ["assignedTo"]`), por isso exige `assignedTo: { not: null }` — tarefa sem responsável não tem
 * para quem ser contada, que é exatamente o que `assignedTo: userId` dos outros três já recorta.
 *
 * O elo não é lido aqui: quem decide o degrau é `eloForSeasonXp` no use case (a mesma escada dos
 * slots). `users.completedTasks` também não: a trilha vitalícia serve de métrica de troféu na janela
 * `vida`, não de coluna do quadro mensal (MODELO §2).
 */
export function createPrismaMonthlyRankingPort(): MonthlyRankingPort {
  return {
    async listRows({ start, endExclusive }: MonthWindowInstants) {
      const [users, progressos, delegadasAprovadas, trophies] = await Promise.all([
        prisma.users.findMany({
          select: {
            id: true,
            name: true,
            avatar: true,
            bannerKey: true,
            roles: true,
            points: true,
            xp: true,
            coins: true,
          },
          orderBy: { id: "asc" },
        }),
        prisma.task_user_progress.groupBy({
          by: ["userId"],
          where: { completedAt: { gte: start, lt: endExclusive } },
          _count: { _all: true },
        }),
        prisma.tasks.groupBy({
          by: ["assignedTo"],
          where: {
            assignedTo: { not: null },
            completedAt: { gte: start, lt: endExclusive },
            isGlobal: false,
            taskVisibility: { not: "public" },
          },
          _count: { _all: true },
        }),
        prisma.user_badges.groupBy({
          by: ["userId", "equipped"],
          _count: { _all: true },
        }),
      ]);

      const tasksByUser = new Map<number, number>();
      for (const row of progressos) {
        tasksByUser.set(row.userId, (tasksByUser.get(row.userId) ?? 0) + row._count._all);
      }
      for (const row of delegadasAprovadas) {
        if (row.assignedTo === null) continue;
        tasksByUser.set(row.assignedTo, (tasksByUser.get(row.assignedTo) ?? 0) + row._count._all);
      }

      const trophiesByUser = new Map<number, { equipped: number; total: number }>();
      for (const row of trophies) {
        const current = trophiesByUser.get(row.userId) ?? { equipped: 0, total: 0 };
        current.total += row._count._all;
        if (row.equipped) current.equipped += row._count._all;
        trophiesByUser.set(row.userId, current);
      }

      return users.map<MonthlyRankingRow>((user) => {
        const counts = trophiesByUser.get(user.id) ?? { equipped: 0, total: 0 };
        return {
          userId: user.id,
          name: user.name,
          avatar: user.avatar,
          bannerKey: user.bannerKey,
          roles: user.roles,
          points: user.points,
          xp: user.xp,
          coins: user.coins,
          monthTasks: tasksByUser.get(user.id) ?? 0,
          trophiesEquipped: counts.equipped,
          trophiesTotal: counts.total,
        };
      });
    },
  };
}
