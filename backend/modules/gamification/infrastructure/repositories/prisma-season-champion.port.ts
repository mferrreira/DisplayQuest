import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import type { SeasonChampionPort } from "@/backend/modules/gamification/application/ports/season-champion.port";

/**
 * PrismaSeasonChampionPort — plan-v8 V8-4 (DEC-213). O troféu do primeiro colocado do ano.
 *
 * A chave de reexecução é a linha de auditoria (`GAMIFICATION:SEASON_CHAMPION:<ano>:<pessoa>`), lida
 * antes de qualquer escrita e reconfirmada dentro da transação: não existe tabela para o campeão, do
 * mesmo modo que a revisão semanal de XP (V8-3) não criou tabela para o dedup semanal. Uma segunda
 * run do mesmo ano lê a linha e devolve `already-awarded` sem tocar em `user_badges`.
 *
 * A linha não declara trilha. O vocabulário de `history.track` é `POINTS | COINS | XP` e é de saldos
 * (`tracks.ts`); troféu não é saldo, é `user_badges` — a própria guarda das trilhas diz isso. A coluna
 * fica com o default, como ficou em toda linha anterior ao plan-v8.
 *
 * O badge é resolvido por NOME e vem da data migration `prisma/data-migrations/v8-4-badge-campeao.sql`
 * com `criteria = NULL`. Com critério nulo o motor atual de avaliação devolve falso para qualquer
 * pessoa (`badgeCriteriaMet` corta em `!criteria`), e um critério com `specialCondition` nova cairia no
 * QUIRK-6C (condição desconhecida devolve verdadeiro) e concederia o troféu a todo mundo na primeira
 * avaliação disparada por conclusão de tarefa. A concessão é só desta rotina.
 *
 * `badge-ausente` não é erro: é o estado de uma instância cujo catálogo ainda não recebeu o troféu. O
 * use case reporta o estado e o cron loga o aviso; as linhas de temporada já escritas continuam
 * escritas.
 */
export function createPrismaSeasonChampionPort(): SeasonChampionPort {
  return {
    async awardSeasonChampion({ year, userId, badgeName, description }) {
      return prisma.$transaction(async (tx) => {
        const recorded = await tx.history.findFirst({
          where: {
            entityType: "USER",
            entityId: userId,
            action: "SEASON_CHAMPION",
            description,
          },
          select: { id: true },
        });
        if (recorded) {
          return { status: "already-awarded" as const, badgeId: null };
        }

        const badge = await tx.badges.findFirst({
          where: { name: badgeName },
          select: { id: true },
        });
        if (!badge) {
          return { status: "badge-ausente" as const, badgeId: null };
        }

        const owned = await tx.user_badges.findFirst({
          where: { userId, badgeId: badge.id },
          select: { id: true },
        });
        if (!owned) {
          await tx.user_badges.create({
            data: { userId, badgeId: badge.id, earnedBy: null, equipped: false },
          });
        }

        await tx.history.create({
          data: {
            entityType: "USER",
            entityId: userId,
            action: "SEASON_CHAMPION",
            performedBy: userId,
            description,
            oldValues: Prisma.JsonNull,
            newValues: {
              sourceType: "SEASON_CLOSE",
              sourceId: year,
              badgeId: badge.id,
              badgeName,
              // Conquistado é uma coisa, equipado é outra (DEC-219): a pessoa escolhe o que usa no
              // perfil, e o slot é o do elo — que ainda não existe. Ninguém acorda equipado.
              alreadyOwned: Boolean(owned),
            },
            metadata: {
              domain: "gamification",
              sourceType: "SEASON_CLOSE",
              sourceId: year,
              badgeId: badge.id,
            },
          },
        });

        return { status: owned ? ("already-awarded" as const) : ("awarded" as const), badgeId: badge.id };
      });
    },
  };
}
