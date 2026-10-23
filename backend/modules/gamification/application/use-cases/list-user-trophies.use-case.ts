import { readTrophyEffects, type TrophyEffect } from "@/backend/domain/gamification";
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port";
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port";

/**
 * ListUserTrophiesUseCase — plan-v8 V8-7 (DEC-220). O que a prateleira de troféus do perfil mostra:
 * os troféus que a pessoa conquistou, com o nome, a descrição e os efeitos do catálogo, e o estado de
 * equip de cada um.
 *
 * Por que esta leitura existe se já existe `GET /api/user-badges`: a leitura aberta de hoje devolve a
 * LINHA da conquista (`userId`, `badgeId`, `equipped`, `earnedAt`) e o catálogo não vem junto — o
 * componente de telas antiga filtra as linhas sem `badge` e, medida na própria tela, é por isso que a
 * lista de conquistas aparece vazia. A prateleira precisa do nome e do efeito para a pessoa decidir o
 * que equipar, então o join acontece AQUI, sobre o catálogo inteiro (três linhas de catálogo na
 * instância; `findAll` é uma query, não uma por conquista).
 *
 * O port de troféu continua sendo um por tabela: `user_badges` é lido pela `UserBadgePort`, o catálogo
 * pela `BadgeCatalogPort`. Uma segunda porta lendo as mesmas tabelas é o modo de falha que a guarda de
 * janelas (V8-6) fecha.
 *
 * Leitura aberta, sem ator: a mesma decisão do dono para `GET /api/user-badges` (2026-10-07) — ver o
 * perfil do outro inclui ver os troféus dele. Quem EQUIPA é só a pessoa, e isso é o PATCH da mesma
 * rota (DEC-218).
 */
export interface UserTrophy {
  /** O id da CONQUISTA (`user_badges.id`): é sobre ele que o equip escreve. */
  userBadgeId: number;
  badgeId: number;
  name: string;
  description: string;
  equipped: boolean;
  earnedAt: Date | null;
  /** Os efeitos do catálogo, lidos pela regra (`readTrophyEffects`) — troféu sem efeito é lista vazia. */
  effects: TrophyEffect[];
}

export interface ListUserTrophiesDependencies {
  userBadges: UserBadgePort;
  badges: BadgeCatalogPort;
}

export class ListUserTrophiesUseCase {
  constructor(private readonly dependencies: ListUserTrophiesDependencies) {}

  async execute(query: { userId: number }): Promise<UserTrophy[]> {
    const [conquistas, catalog] = await Promise.all([
      this.dependencies.userBadges.findByUserId(query.userId),
      this.dependencies.badges.findAll(),
    ]);

    const badgesById = new Map(catalog.map((badge) => [badge.id, badge]));

    return conquistas.flatMap((conquista) => {
      const badge = badgesById.get(conquista.badgeId);
      const userBadgeId = conquista.id;
      // O catálogo cascadeia a conquista (`user_badges.badge onDelete: Cascade`), então uma linha sem
      // catálogo não deveria existir. Se existir, a tela não inventa nome nem efeito: sai da prateleira.
      if (!badge || !userBadgeId) return [];
      return [
        {
          userBadgeId,
          badgeId: conquista.badgeId,
          name: badge.name,
          description: badge.description,
          equipped: conquista.equipped === true,
          earnedAt: conquista.earnedAt ?? null,
          effects: readTrophyEffects(badge.effects),
        },
      ];
    });
  }
}
