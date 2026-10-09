/**
 * B6-2a (D4, DEC-53) — o gate de MANAGE_REWARDS saiu da rota e passou a ser EXIGIDO pelos
 * 4 use cases de escrita de reward. Este arquivo fixa esse comportamento no nível do use
 * case, sobre uma porta falsa, porque antes o store só tinha `store-rules.test.ts` (regras
 * puras) e a negação por papel não tinha cobertura nenhuma.
 *
 * O que está congelado aqui, e por quê:
 *
 *  - **a mensagem**. A rota legacy chamava `ensurePermission(actor, "MANAGE_REWARDS")` SEM
 *    mensagem, e o default dela é "Acesso negado". O 403 que o cliente vê não pode mudar de
 *    texto ao atravessar a refatoração — daí `assertPermission` usar o mesmo default.
 *  - **a ordem**. O gate rodava antes de o corpo ser lido. Se a checagem viesse depois de
 *    qualquer regra, quem não tem permissão receberia 400 em vez de 403.
 *  - **a porta não é tocada**. Um 403 que já escreveu no banco não é só um status errado.
 *
 * A negação *por rota* (HTTP, status, corpo `{error, code, details}`) está em
 * `tests/unit/api/authorization-characterization.test.ts`; aqui o que se fixa é a decisão.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain";
import type { IReward } from "@/backend/domain";
import { createStoreModule } from "@/backend/modules/store";
import type { PurchaseRepository } from "@/backend/modules/store/application/ports/purchase.repository";
import type { RewardRepository } from "@/backend/modules/store/application/ports/reward.repository";

/** COORDENADOR tem MANAGE_REWARDS na matriz real (`backend/domain/identity/permissions.ts`). */
const MANAGER_ROLES = ["COORDENADOR"];
/** VOLUNTARIO é o papel sem nenhuma permissão de gestão. */
const NO_MANAGEMENT_ROLES = ["VOLUNTARIO"];

/** "Acesso negado" — o default de `ensurePermission` e de `ForbiddenError`, idêntico por opção. */
const LEGACY_DENIED_MESSAGE = "Acesso negado";

function makeReward(overrides: Partial<IReward> = {}): IReward {
  return {
    id: 1,
    name: "Kit",
    description: "desc",
    price: 30,
    imageUrl: null,
    categoryId: null,
    stock: null,
    available: true,
    ...overrides,
  } as IReward;
}

function makeFakes() {
  const store: IReward[] = [];
  const created: unknown[] = [];
  const updatedFields: unknown[] = [];
  const deletedIds: number[] = [];

  const rewards: RewardRepository = {
    async findById(id) {
      return store.find((r) => r.id === id) ?? null;
    },
    async findAll() {
      return [...store];
    },
    async create(input) {
      created.push(input);
      const reward = makeReward({ id: store.length + 1, ...(input as object) });
      store.push(reward);
      return reward;
    },
    async update(id, fields) {
      updatedFields.push(fields);
      const index = store.findIndex((r) => r.id === id);
      const next = { ...store[index], ...(fields as object) };
      store[index] = next;
      return next;
    },
    async delete(id) {
      deletedIds.push(id);
      store.splice(
        store.findIndex((r) => r.id === id),
        1,
      );
    },
  };

  /**
   * `createStoreModule` instancia os 12 use cases do módulo (6 de reward + 6 de compra), então
   * a porta de compras precisa existir mesmo num teste que só exercita reward. Este duplo
   * falha alto se algum caminho de compra for exercitado por engano — que é o objetivo: aqui
   * só se prueba autorização de reward.
   */
  const notUsed = (name: string) => (): never => {
    throw new Error(`porta de compras não deveria ser usada neste teste: ${name}`);
  };
  const purchases: PurchaseRepository = {
    findById: notUsed("findById"),
    findAll: notUsed("findAll"),
    findByUserId: notUsed("findByUserId"),
    findByRewardId: notUsed("findByRewardId"),
    findByStatus: notUsed("findByStatus"),
    findUserById: notUsed("findUserById"),
    createWithPointDeduction: notUsed("createWithPointDeduction"),
    update: notUsed("update"),
    delete: notUsed("delete"),
    refundPoints: notUsed("refundPoints"),
  } as unknown as PurchaseRepository;

  return { rewards, purchases, store, created, updatedFields, deletedIds };
}

describe("store — gate de MANAGE_REWARDS nos use cases de reward (B6-2a, DEC-53)", () => {
  let fakes: ReturnType<typeof makeFakes>;

  beforeEach(() => {
    fakes = makeFakes();
  });

  const module_ = () => createStoreModule({ ports: { rewards: fakes.rewards, purchases: fakes.purchases } });

  describe("negação", () => {
    it("createReward: sem a permissão lança ForbiddenError com a mensagem legada", async () => {
      await expect(
        module_().createReward({ actorRoles: NO_MANAGEMENT_ROLES, data: { name: "Kit", price: 10 } }),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        module_().createReward({ actorRoles: NO_MANAGEMENT_ROLES, data: { name: "Kit", price: 10 } }),
      ).rejects.toThrow(LEGACY_DENIED_MESSAGE);
      expect(fakes.created).toHaveLength(0);
    });

    it("updateReward: sem a permissão lança ForbiddenError e não procura nem escreve", async () => {
      fakes.store.push(makeReward());
      await expect(
        module_().updateReward({ actorRoles: NO_MANAGEMENT_ROLES, rewardId: 1, data: { price: 25 } }),
      ).rejects.toThrow(LEGACY_DENIED_MESSAGE);
      expect(fakes.updatedFields).toHaveLength(0);
      expect(fakes.store[0].price).toBe(30);
    });

    it("patchReward: sem a permissão lança ForbiddenError e não apaga nada", async () => {
      fakes.store.push(makeReward());
      await expect(
        module_().patchReward({ actorRoles: NO_MANAGEMENT_ROLES, rewardId: 1, action: "toggle-availability" }),
      ).rejects.toThrow(LEGACY_DENIED_MESSAGE);
      expect(fakes.updatedFields).toHaveLength(0);
      expect(fakes.store[0].available).toBe(true);
    });

    it("deleteReward: sem a permissão lança ForbiddenError e a linha continua no banco", async () => {
      fakes.store.push(makeReward());
      await expect(module_().deleteReward({ actorRoles: NO_MANAGEMENT_ROLES, rewardId: 1 })).rejects.toThrow(
        LEGACY_DENIED_MESSAGE,
      );
      expect(fakes.deletedIds).toHaveLength(0);
      expect(fakes.store).toHaveLength(1);
    });
  });

  describe("o gate vem antes de qualquer regra", () => {
    it("createReward: permissão negada ganha do payload inválido (2007-style: 403 antes de 400)", async () => {
      // Sem permissão E nome vazio. O legado devolvia 403, porque o gate rodava antes de
      // o corpo ser lido. Se a ordem invertisse, viraria ValidationError.
      await expect(
        module_().createReward({ actorRoles: NO_MANAGEMENT_ROLES, data: { name: "  ", price: -1 } }),
      ).rejects.toThrow(ForbiddenError);

      // Mesma entrada, com permissão: agora é a regra de negócio que fala.
      await expect(
        module_().createReward({ actorRoles: MANAGER_ROLES, data: { name: "  ", price: -1 } }),
      ).rejects.toThrow(ValidationError);
    });

    it("updateReward: negada ganha do id inexistente (403 antes de 404)", async () => {
      await expect(
        module_().updateReward({ actorRoles: NO_MANAGEMENT_ROLES, rewardId: 999999, data: {} }),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        module_().updateReward({ actorRoles: MANAGER_ROLES, rewardId: 999999, data: {} }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("papel sujo nega em vez de estourar", () => {
    // `actorRoles` é `unknown` de propósito: chega cru da sessão e a regra nunca lança
    // sobre entrada suja. Negar é o comportamento; um crash seria um 500 vazando a rota.
    it.each([
      ["undefined", undefined],
      ["string no lugar de array", "COORDENADOR"],
      ["array vazio", []],
      ["papel inexistente", ["ASTROLOGISTA"]],
      ["objeto", { role: "COORDENADOR" }],
      ["número", 7],
    ])("createReward com %s nega", async (_label, actorRoles) => {
      await expect(
        module_().createReward({ actorRoles, data: { name: "Kit", price: 10 } }),
      ).rejects.toThrow(ForbiddenError);
      expect(fakes.created).toHaveLength(0);
    });
  });

  describe("com a permissão, o comportamento legado segue intacto", () => {
    it("createReward normaliza e grava", async () => {
      const reward = await module_().createReward({
        actorRoles: MANAGER_ROLES,
        data: { name: " Kit ", price: 30 },
      });
      expect(reward).toBeTruthy();
      expect(fakes.created).toHaveLength(1);
    });

    it("updateReward faz merge parcial", async () => {
      fakes.store.push(makeReward());
      const updated = await module_().updateReward({
        actorRoles: MANAGER_ROLES,
        rewardId: 1,
        data: { price: 25 },
      });
      expect(updated.price).toBe(25);
      // merge: o campo não enviado continua
      expect(updated.name).toBe("Kit");
    });

    it("patchReward alterna a disponibilidade", async () => {
      fakes.store.push(makeReward());
      const toggled = await module_().patchReward({
        actorRoles: MANAGER_ROLES,
        rewardId: 1,
        action: "toggle-availability",
      });
      expect(toggled.available).toBe(false);
    });

    it("deleteReward remove", async () => {
      fakes.store.push(makeReward());
      await module_().deleteReward({ actorRoles: MANAGER_ROLES, rewardId: 1 });
      expect(fakes.deletedIds).toEqual([1]);
      expect(fakes.store).toHaveLength(0);
    });
  });

  describe("leitura não ganhou ator", () => {
    // Lista e busca continuam sem ator: a rota exige sessão, e sessão não é autorização.
    // Fixado aqui para que ninguém "conserte" isso achando que faltou gate.
    it("listRewards e getReward funcionam sem nenhum campo de ator", async () => {
      fakes.store.push(makeReward());
      expect(await module_().listRewards()).toHaveLength(1);
      expect(await module_().getReward(1)).toBeTruthy();
    });
  });
});