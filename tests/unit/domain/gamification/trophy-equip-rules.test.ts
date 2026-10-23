/**
 * plan-v8 V8-6 (DEC-218/219) — o vocabulário do equipar/desequipar e a autoridade da pessoa.
 *
 * O que a onda decidiu aqui, e não no use case: as frases congeladas, a ação aceita e a chave da
 * linha de auditoria. Congelado neste arquivo para que a frase que o painel mostra e a frase que o
 * use case devolvam sejam a mesma string escrita uma vez.
 *
 * A autoridade é o ponto que mais facilmente volta a errar: `requireActorSelfOrPermission` é o shape
 * que a casa usa para "self OU gestão", e equipar troféu é a metade `self` tomada sozinha. Um gate
 * emprestando `MANAGE_USERS` (ou deixando o bypass de sistema passar) é a gestão equipando o troféu de
 * outra pessoa — DEC-218 diz que quem equipa é a pessoa.
 */
import { describe, expect, it } from "vitest";

import {
  TROPHY_EQUIP_ACTIONS,
  TROPHY_EQUIP_ACTIONS_MESSAGE,
  TROPHY_EQUIP_DENIED_MESSAGE,
  TROPHY_NOT_EARNED_MESSAGE,
  TROPHY_BADGE_NOT_FOUND_MESSAGE,
  canEquipWithinSlots,
  parseTrophyEquipAction,
  trophyEquipAudit,
  trophyEquipDescription,
} from "@/backend/domain/gamification";
import { DomainError, ForbiddenError, ValidationError } from "@/backend/domain/errors/DomainError";
import { systemActor, userActor } from "@/backend/domain/identity";
import { requireActorSelf } from "@/backend/domain/identity/assert-permission";

describe("domain/gamification: a ação do equip (DEC-218)", () => {
  it("duas ações, e nada além delas", () => {
    expect(TROPHY_EQUIP_ACTIONS).toEqual(["equip", "unequip"]);
    expect(parseTrophyEquipAction("equip")).toBe("equip");
    expect(parseTrophyEquipAction("unequip")).toBe("unequip");
  });

  it("fora das duas ações é 400 com a frase congelada, nomeada em um lugar só", () => {
    expect(TROPHY_EQUIP_ACTIONS_MESSAGE).toBe("Ação inválida");
    for (const raw of [undefined, null, "", "EQUIP", "wear", "toggle", 1, {}, [], true]) {
      // Recusar SEM engolir o que passou: `expect(...).toThrow` sozinho deixaria o caso verde se a
      // função aceitasse a entrada e o `catch` nunca rodasse.
      expect(() => parseTrophyEquipAction(raw)).toThrow(TROPHY_EQUIP_ACTIONS_MESSAGE);
      expect(() => parseTrophyEquipAction(raw)).toThrow(ValidationError);
    }
  });
});

describe("domain/gamification: as frases do troféu (DEC-218/219)", () => {
  it("as três frases que o usuário vê, escritas uma vez cada", () => {
    expect(TROPHY_EQUIP_DENIED_MESSAGE).toBe("Só a própria pessoa pode equipar seus troféus.");
    expect(TROPHY_NOT_EARNED_MESSAGE).toBe("Usuário não possui este troféu");
    expect(TROPHY_BADGE_NOT_FOUND_MESSAGE).toBe("Badge não encontrado");
  });
});

describe("domain/gamification: a linha de auditoria do movimento de troféu", () => {
  it("a chave nomeia a pessoa E o troféu, porque entityId é a pessoa e performedBy é quem assinou", () => {
    expect(trophyEquipDescription("equip", 7, 812)).toBe("GAMIFICATION:TROPHY_EQUIP:7:812");
    expect(trophyEquipDescription("unequip", 7, 812)).toBe("GAMIFICATION:TROPHY_UNEQUIP:7:812");
    // Duas pessoas com o mesmo troféu tem chave diferente, e a linha continua legível depois de o
    // troféu sair do catálogo (`user_badges` cascadeia, `history` não).
    expect(trophyEquipDescription("equip", 8, 812)).not.toBe(trophyEquipDescription("equip", 7, 812));
  });

  it("o estado registrado é o conjunto equipado, antes e depois", () => {
    expect(trophyEquipAudit("equip", 812, 1, 2)).toEqual({
      domain: "gamification",
      action: "equip",
      badgeId: 812,
      equippedBefore: 1,
      equippedAfter: 2,
    });
  });
});

describe("domain/gamification: a conta do slot (DEC-217)", () => {
  it("o teto é estrito: a contagem lida tem que ficar ABAIXO do slot", () => {
    expect(canEquipWithinSlots(0, 1)).toBe(true);
    expect(canEquipWithinSlots(1, 1)).toBe(false);
    expect(canEquipWithinSlots(1, 2)).toBe(true);
    expect(canEquipWithinSlots(2, 2)).toBe(false);
    expect(canEquipWithinSlots(2, 3)).toBe(true);
    // BRONZE tem slot 0: ninguém equipar nada, e a conta diz isso sem caso especial.
    expect(canEquipWithinSlots(0, 0)).toBe(false);
  });
});

function captureForbidden(roles: string[]): unknown {
  try {
    requireActorSelf(userActor(1, roles), 7, TROPHY_EQUIP_DENIED_MESSAGE);
  } catch (error) {
    return error;
  }
  throw new Error(`${roles.join("/")} passou no gate do equip`);
}

describe("domain/identity: requireActorSelf — quem equipa é a pessoa (DEC-218)", () => {
  it("a própria pessoa passa, sem depender de papel nenhum", () => {
    expect(() => requireActorSelf(userActor(7, ["VOLUNTARIO"]), 7, TROPHY_EQUIP_DENIED_MESSAGE)).not.toThrow();
    expect(() => requireActorSelf(userActor(7, []), 7, TROPHY_EQUIP_DENIED_MESSAGE)).not.toThrow();
  });

  it("gestão com MANAGE_USERS não equipar troféu de outra pessoa", () => {
    // Os papéis que têm MANAGE_USERS/MANAGE_REWARDS na matriz real (não são permissões escritas como
    // papel: `userActor` recebe papéis, e a permissão é o que a matriz devolve deles).
    for (const roles of [["COORDENADOR"], ["GERENTE"], ["ADMIN"], ["LABORATORISTA"], ["GERENTE_PROJETO"]]) {
      expect(() => requireActorSelf(userActor(1, roles), 7, TROPHY_EQUIP_DENIED_MESSAGE)).toThrow(TROPHY_EQUIP_DENIED_MESSAGE);
      const error = captureForbidden(roles);
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as DomainError).status).toBe(403);
    }
  });

  it("o ator de sistema NÃO passa: não existe rotina que equipar troféu de ninguém", () => {
    // É a diferença em relação a `requireActorSelfOrPermission`, que aceita o bypass declarado
    // (DEC-54). Uma porta sem chamador é exatamente o tipo de porta que a DEC-54 teve que fechar.
    expect(() => requireActorSelf(systemActor("MONTHLY_POINTS_RESET"), 7, TROPHY_EQUIP_DENIED_MESSAGE)).toThrow(ForbiddenError);
    expect(() => requireActorSelf(systemActor("SEASON_CLOSE"), 7, TROPHY_EQUIP_DENIED_MESSAGE)).toThrow(TROPHY_EQUIP_DENIED_MESSAGE);
  });
});
