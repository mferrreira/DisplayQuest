/**
 * plan-v16 S01 (R1, INV4) — a chave do ícone é produzida pela regra de prefixo e passa
 * pelas regras de escrita do badge.
 *
 *  - `badgeIconPrefix` só aceita id inteiro positivo e devolve `badges/<id>`;
 *  - create aceita `iconKey` string, normaliza vazio a null, recusa acima do teto;
 *  - update mergeia `iconKey` por chave (ausente não apaga, null apaga).
 */
import { describe, expect, it } from "vitest";

import { ValidationError } from "@/backend/domain";
import { applyBadgeUpdate, badgeIconPrefix, validateBadgeCreateInput } from "@/backend/domain";

const BASE = { name: "Selo", description: "desc", category: "achievement", createdBy: 1 };

describe("badgeIconPrefix", () => {
  it("devolve o prefixo fechado badges/<id>", () => {
    expect(badgeIconPrefix(7)).toBe("badges/7");
    expect(badgeIconPrefix(1)).toBe("badges/1");
  });

  it("recusa id que não é inteiro positivo", () => {
    for (const bad of [0, -1, 1.5, NaN]) {
      expect(() => badgeIconPrefix(bad)).toThrow(ValidationError);
    }
  });
});

describe("iconKey nas regras de escrita do badge", () => {
  it("create aceita a chave e devolve a string normalizada", () => {
    const data = validateBadgeCreateInput({ ...BASE, iconKey: "  badges/7/x.webp  " });
    expect(data.iconKey).toBe("badges/7/x.webp");
  });

  it("create sem chave, ou chave vazia, devolve null", () => {
    expect(validateBadgeCreateInput({ ...BASE }).iconKey).toBeNull();
    expect(validateBadgeCreateInput({ ...BASE, iconKey: "" }).iconKey).toBeNull();
  });

  it("create recusa chave acima do teto (160 caracteres)", () => {
    expect(() => validateBadgeCreateInput({ ...BASE, iconKey: "a".repeat(161) })).toThrow(ValidationError);
  });

  it("update mergeia iconKey por chave: ausente não apaga, null apaga", () => {
    const current = {
      id: 7,
      name: "Selo",
      description: "desc",
      category: "achievement" as const,
      criteria: null,
      isActive: true,
      createdBy: 1,
      iconKey: "badges/7/x.webp",
    };
    expect(applyBadgeUpdate(current, { name: "Novo" }).iconKey).toBe("badges/7/x.webp");
    expect(applyBadgeUpdate(current, { iconKey: null }).iconKey).toBeNull();
    expect(applyBadgeUpdate(current, { iconKey: "badges/7/y.webp" }).iconKey).toBe("badges/7/y.webp");
  });
});
