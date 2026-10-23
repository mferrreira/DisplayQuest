import { Prisma } from "@prisma/client";

import {
  SEASON_POINTS_AFTER_CLOSE,
  SEASON_XP_AFTER_CLOSE,
  seasonMonthPrefix,
} from "@/backend/domain/gamification";
import type { SeasonCyclePort } from "@/backend/modules/gamification/application/ports/season-cycle.port";
import { prisma } from "@/lib/database/prisma";

/**
 * PrismaSeasonCyclePort — plan-v8 V8-4 (DEC-213). O fechamento da temporada anual.
 *
 * `listCandidatesForSeasonClose` agrega o ano com DUAS queries e nada mais: os usuários (com as duas
 * colunas da temporada lidas no instante da chamada) e as linhas de `month_history` do ano, agrupadas
 * em memória. Uma query por pessoa seria o jeito de o fechamento custar linearmente pelo cadastro —
 * e o somatório sai do prefixo do ano vindo do domínio (`seasonMonthPrefix`), não de um literal `LIKE`
 * escrito aqui: o formato do mês é do `monthly-cycle.ts` (DEC-212), e a mesma fonte sustenta as duas
 * leituras.
 *
 * `closeSeason` escreve os três lados num único `$transaction` (snapshot primeiro, zeragens por
 * último) e devolve `false` no conflito de unique `(userId, year)` — o backstop da corrida, como no
 * mensal. O que a zeragem alcança é `points` e `xp`, as duas trilhas da temporada. `coins` e
 * `user_badges` não aparecem na instrução: moeda e troféu são vitalícios (MODELO §4), e a prova de
 * que isso não muda está no roundtrip da onda.
 *
 * O elo vai nulo de propósito: a escada com umbrais é a DEC-217 e entra na V8-6. Hoje nenhum lugar do
 * sistema guarda elo (o `Progression.ts` deriva de pontos numa trilha que a virada zera), então o
 * livro-caixa grava o que existe — pontos, tarefas, XP e a posição — e deixa o elo para a onda que o
 * define.
 */
export function createPrismaSeasonCyclePort(): SeasonCyclePort {
  return {
    async listCandidatesForSeasonClose(year) {
      const prefix = seasonMonthPrefix(year);
      const [rows, months] = await Promise.all([
        prisma.users.findMany({
          select: { id: true, name: true, points: true, xp: true },
          orderBy: { id: "asc" },
        }),
        prisma.month_history.findMany({
          where: { month: { startsWith: prefix } },
          select: { userId: true, points: true, completedTasks: true },
        }),
      ]);

      const aggregates = new Map<number, { monthsInYear: number; seasonPoints: number; seasonCompletedTasks: number }>();
      for (const month of months) {
        const current = aggregates.get(month.userId) ?? { monthsInYear: 0, seasonPoints: 0, seasonCompletedTasks: 0 };
        aggregates.set(month.userId, {
          monthsInYear: current.monthsInYear + 1,
          seasonPoints: current.seasonPoints + month.points,
          seasonCompletedTasks: current.seasonCompletedTasks + month.completedTasks,
        });
      }

      return rows.map((row) => {
        const aggregate = aggregates.get(row.id) ?? { monthsInYear: 0, seasonPoints: 0, seasonCompletedTasks: 0 };
        return {
          userId: row.id,
          name: row.name,
          xp: row.xp,
          points: row.points,
          ...aggregate,
        };
      });
    },

    async getSeasonSnapshot(userId, year) {
      const existing = await prisma.season_history.findFirst({
        where: { userId, year },
        select: { userId: true, year: true, points: true, completedTasks: true, xp: true, elo: true, position: true },
      });
      if (!existing) return null;
      return {
        userId: existing.userId,
        year: existing.year,
        points: existing.points,
        completedTasks: existing.completedTasks,
        xp: existing.xp,
        elo: existing.elo,
        position: existing.position,
      };
    },

    async closeSeason({ userId, year, points, completedTasks, xp, elo, position }) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.season_history.create({
            data: { userId, year, points, completedTasks, xp, elo, position },
          });
          await tx.users.update({
            where: { id: userId },
            data: { points: SEASON_POINTS_AFTER_CLOSE, xp: SEASON_XP_AFTER_CLOSE },
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

    async listSeasonStandings(year) {
      const rows = await prisma.season_history.findMany({
        where: { year },
        select: {
          userId: true,
          points: true,
          completedTasks: true,
          xp: true,
          user: { select: { name: true } },
        },
        orderBy: { userId: "asc" },
      });
      return rows.map((row) => ({
        userId: row.userId,
        name: row.user.name,
        points: row.points,
        completedTasks: row.completedTasks,
        xp: row.xp,
      }));
    },
  };
}
