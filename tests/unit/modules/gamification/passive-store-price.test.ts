/**
 * plan-v15 S08 (R14/R12) — o desconto da passiva entra no snapshot da compra, com piso 1.
 *
 * O que este arquivo trava:
 *  - sem passiva: o snapshot carrega o preço da tabela;
 *  - +10%: preço 100 cobra 90;
 *  - cap +100%: bônus 60% + 50% é cortado a 100% e o piso 1 do dono segura;
 *  - a elegibilidade continua medindo o preço da TABELA (par medido da rota, intocado);
 *  - a passiva lida é a do alvo da compra (`userId`), não a de quem opera a rota.
 */
import { describe, expect, it } from "vitest";

import { userActor, ValidationError } from "@/backend/domain";
import type { BadgeEffect } from "@/backend/domain";
import { CreatePurchaseUseCase } from "@/backend/modules/store/application/use-cases/purchase.use-cases";

function makeUseCase(price: number, userPoints: number, effects: BadgeEffect[], targetUserId: number) {
  const snapshots: Array<{ price: number; userId: number }> = [];
  const reads: number[] = [];

  const purchases = {
    async findUserById(userId: number) {
      return { id: userId, points: userPoints };
    },
    async createWithPointDeduction(snapshot: { price: number; userId: number }) {
      snapshots.push({ price: snapshot.price, userId: snapshot.userId });
      return snapshot;
    },
  };

  const rewards = {
    async findById(_id: number) {
      return { id: 3, name: "Caneca", price, available: true, stock: null };
    },
  };

  const passives = {
    async bonusEffectsFor(userId: number) {
      reads.push(userId);
      return effects;
    },
  };

  return {
    useCase: new CreatePurchaseUseCase(purchases as never, rewards as never, passives, { async recompute() {} }),
    snapshots,
    reads,
    targetUserId,
  };
}

const actor = userActor(42, []);

describe("CreatePurchaseUseCase com desconto de passiva", () => {
  it("sem passiva: snapshot com o preço da tabela", async () => {
    const { useCase, snapshots } = makeUseCase(100, 1000, [], 42);
    await useCase.execute({ actor, data: { userId: 42, rewardId: 3 } });
    expect(snapshots[0].price).toBe(100);
  });

  it("+10% equipada: preço 100 cobra 90", async () => {
    const { useCase, snapshots } = makeUseCase(100, 1000, [{ kind: "bonus", pct: 0.1 }], 42);
    await useCase.execute({ actor, data: { userId: 42, rewardId: 3 } });
    expect(snapshots[0].price).toBe(90);
  });

  it("cap +100%: 60% + 50% cortados a 100%, e o piso 1 segura", async () => {
    const { useCase, snapshots } = makeUseCase(5, 1000, [{ kind: "bonus", pct: 0.6 }, { kind: "bonus", pct: 0.5 }], 42);
    await useCase.execute({ actor, data: { userId: 42, rewardId: 3 } });
    expect(snapshots[0].price).toBe(1);
  });

  it("a elegibilidade mede o preço da tabela: com saldo 95 e preço 100 (+10% cobraria 90) a compra é recusada", async () => {
    const { useCase, snapshots } = makeUseCase(100, 95, [{ kind: "bonus", pct: 0.1 }], 42);
    await expect(useCase.execute({ actor, data: { userId: 42, rewardId: 3 } })).rejects.toThrow(ValidationError);
    expect(snapshots).toHaveLength(0);
  });

  it("gestão comprando para terceiro lê a passiva do alvo da compra, não a do ator", async () => {
    const manager = userActor(1, ["COORDENADOR"]);
    const { useCase, reads, snapshots } = makeUseCase(100, 1000, [{ kind: "bonus", pct: 0.1 }], 7);
    await useCase.execute({ actor: manager, data: { userId: 7, rewardId: 3 } });
    expect(reads).toEqual([7]);
    expect(snapshots[0]).toMatchObject({ userId: 7, price: 90 });
  });
});
