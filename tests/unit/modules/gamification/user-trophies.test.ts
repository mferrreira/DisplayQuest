/**
 * plan-v8 V8-7 (DEC-220) — `ListUserTrophiesUseCase` sobre port falsa, sem banco.
 *
 * Esta leitura existe porque a leitura aberta de conquistas (`GET /api/user-badges`) devolve a LINHA da
 * conquista sem catálogo, e a tela antiga filtrava as linhas sem `badge` — medida, a lista de conquistas
 * não mostrava nada. Congelado aqui:
 *   1. o join conquista × catálogo acontece no use case (nome, descrição e efeitos do catálogo), e as
 *      duas tabelas continuam tendo UMA port cada (`user_badges` × `badges`);
 *   2. o efeito é lido pela regra (`readTrophyEffects`): Json inválido no catálogo devolve lista vazia
 *      e o troféu continua na prateleira — tela não inventa número;
 *   3. conquista sem catálogo sai da prateleira em vez de aparecer com nome inventado (o catálogo
 *      cascadeia a conquista, então o caso é de defense-in-depth, não de fluxo esperado);
 *   4. a ordem da port (conquista mais recente primeiro) é preservada: o use case não reordena.
 */
import { beforeEach, describe, expect, it } from "vitest";

import type { Badge, UserBadge } from "@/backend/domain";
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port";
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port";
import { ListUserTrophiesUseCase } from "@/backend/modules/gamification/application/use-cases/list-user-trophies.use-case";

function badge(overrides: Partial<Badge> & { id: number; name: string }): Badge {
  return {
    description: "descrição",
    category: "achievement",
    isActive: true,
    createdBy: 1,
    ...overrides,
  };
}

function conquest(overrides: Partial<UserBadge> & { id: number; badgeId: number }): UserBadge {
  return { userId: 10, earnedAt: new Date("2026-10-01T12:00:00.000Z"), earnedBy: null, equipped: false, ...overrides };
}

describe("ListUserTrophiesUseCase (V8-7)", () => {
  let catalog: Badge[];
  let conquests: UserBadge[];
  let useCase: ListUserTrophiesUseCase;

  beforeEach(() => {
    catalog = [];
    conquests = [];
    const notUsed = (name: string) => () => {
      throw new Error(`${name} não deveria ser usada por esta leitura`);
    };
    const badges = {
      async findAll() {
        return catalog.map((entry) => ({ ...entry }));
      },
      findById: notUsed("badges.findById"),
      findActive: notUsed("badges.findActive"),
      findByCategory: notUsed("badges.findByCategory"),
      create: notUsed("badges.create"),
      update: notUsed("badges.update"),
      delete: notUsed("badges.delete"),
    } as unknown as BadgeCatalogPort;
    const userBadges = {
      async findByUserId() {
        return conquests.map((entry) => ({ ...entry }));
      },
      findRecentByUserId: notUsed("userBadges.findRecentByUserId"),
      findByUserAndBadge: notUsed("userBadges.findByUserAndBadge"),
      create: notUsed("userBadges.create"),
      delete: notUsed("userBadges.delete"),
      countEquipped: notUsed("userBadges.countEquipped"),
      findEquippedEffectsByUserId: notUsed("userBadges.findEquippedEffectsByUserId"),
      setEquipped: notUsed("userBadges.setEquipped"),
    } as unknown as UserBadgePort;
    useCase = new ListUserTrophiesUseCase({ userBadges, badges });
  });

  it("faz o join da conquista com o catálogo, pelo id do troféu", async () => {
    catalog = [
      badge({ id: 21, name: "MARCO DE 100 TAREFAS", description: "100 tarefas concluídas", criteria: { window: "vida", tasks: 100 } }),
      badge({ id: 22, name: "CAMPEÃO", description: "Fechou o ano em primeiro", effects: [{ verb: "pontos_tarefa", tier: "Tier2" }] }),
    ];
    conquests = [
      conquest({ id: 5, badgeId: 22, equipped: true, earnedAt: new Date("2026-01-01T03:05:00.000Z") }),
      conquest({ id: 4, badgeId: 21, earnedAt: new Date("2025-12-20T12:00:00.000Z") }),
    ];

    const result = await useCase.execute({ userId: 10 });

    expect(result.map((entry) => entry.name)).toEqual(["CAMPEÃO", "MARCO DE 100 TAREFAS"]);
    expect(result.map((entry) => entry.userBadgeId)).toEqual([5, 4]);
    expect(result.map((entry) => entry.equipped)).toEqual([true, false]);
    expect(result.map((entry) => entry.description)).toEqual([
      "Fechou o ano em primeiro",
      "100 tarefas concluídas",
    ]);
    // O efeito vem do catálogo e é lido pela regra — o id da conquista é o que o equip escreve.
    expect(result[0].effects).toEqual([{ verb: "pontos_tarefa", tier: "Tier2" }]);
    expect(result[1].effects).toEqual([]);
  });

  it("efeito inválido gravado no catálogo não inventa número na tela", async () => {
    catalog = [badge({ id: 30, name: "EFEITO RUIM", effects: [{ verb: "pontos_tarefa", percent: 12 } as never] })];
    conquests = [conquest({ id: 8, badgeId: 30 })];

    const result = await useCase.execute({ userId: 10 });

    expect(result).toHaveLength(1);
    expect(result[0].effects).toEqual([]);
  });

  it("conquista sem catálogo sai da prateleira", async () => {
    catalog = [badge({ id: 40, name: "NOVO" })];
    conquests = [conquest({ id: 9, badgeId: 41 }), conquest({ id: 10, badgeId: 40 })];

    const result = await useCase.execute({ userId: 10 });

    expect(result.map((entry) => entry.userBadgeId)).toEqual([10]);
  });

  it("pessoa sem conquista tem prateleira vazia", async () => {
    const result = await useCase.execute({ userId: 11 });

    expect(result).toEqual([]);
  });
});
