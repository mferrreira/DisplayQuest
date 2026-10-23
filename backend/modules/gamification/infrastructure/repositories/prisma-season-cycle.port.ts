import { Prisma } from "@prisma/client";

import {
  FIRST_SEASON_ELO,
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
 * V8-6 (DEC-217) fecha o elo: a linha do ano fotografa o degrau do XP da temporada no instante do
 * fechamento, e a COLUNA `users.elo` volta ao primeiro degrau junto com o XP — a temporada recomeça
 * em BRONZE, e o degrau alcançado fica só no livro. As linhas escritas pela V8-4 seguem com `elo`
 * nulo: o livro não se reescreve, e a leitura devolve o que a linha diz (a coluna do schema continua
 * nula por isso).
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
            data: {
              points: SEASON_POINTS_AFTER_CLOSE,
              xp: SEASON_XP_AFTER_CLOSE,
              // DEC-217: zerar o XP sem zerar o elo deixaria a pessoa no degrau do ano encerrado,
              // abrindo a temporada com um slot de troféu herdado. Os dois zerp juntos.
              elo: FIRST_SEASON_ELO,
            },
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
          elo: true,
          position: true,
          user: { select: { name: true } },
        },
        // A posição do livro, não a da régua viva: depois da virada o XP zerou e só esta linha diz
        // em que lugar a pessoa fechou o ano. `userId` desempata a leitura de linhas sem posição.
        orderBy: [{ position: "asc" }, { userId: "asc" }],
      });
      return rows.map((row) => ({
        userId: row.userId,
        name: row.user.name,
        points: row.points,
        completedTasks: row.completedTasks,
        xp: row.xp,
        elo: row.elo,
        position: row.position,
      }));
    },

    async listSeasonHistoryForUser(userId) {
      const rows = await prisma.season_history.findMany({
        where: { userId },
        select: { year: true, points: true, completedTasks: true, xp: true, elo: true, position: true },
        orderBy: { year: "desc" },
      });
      return rows.map((row) => ({
        year: row.year,
        points: row.points,
        completedTasks: row.completedTasks,
        xp: row.xp,
        elo: row.elo,
        position: row.position,
      }));
    },

    async latestClosedSeasonYear() {
      const row = await prisma.season_history.findFirst({
        select: { year: true },
        orderBy: { year: "desc" },
      });
      return row?.year ?? null;
    },
  };
}
