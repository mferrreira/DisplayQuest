// @vitest-environment node
/**
 * V5-3 (DEC-137) — slot e prefixo da imagem de perfil.
 *
 * Mesma forma medida no V5-2d para o projeto (`project-files-rules.test.ts`): o slot entra na CHAVE
 * do bucket, então a lista é fechada e o prefixo carrega dono e slot.
 */
import { describe, expect, it } from "vitest";

import {
  USER_IMAGE_SLOTS,
  USER_IMAGE_SLOT_MESSAGE,
  isUserImageSlot,
  userImagePrefix,
} from "@/backend/domain";

describe("imagem de perfil — slot e prefixo (V5-3)", () => {
  it("slot é lista fechada: banner, nada além", () => {
    expect(USER_IMAGE_SLOTS).toEqual(["banner"]);
    expect(isUserImageSlot("banner")).toBe(true);
    // "logo" é o slot do PROJETO (DEC-135). Trazer o avatar do usuário para o bucket é outra
    // decisão, e uma lista que o aceitasse hoje abriria `users/7/images/logo` sem decisão.
    expect(isUserImageSlot("logo")).toBe(false);
    expect(isUserImageSlot("avatar")).toBe(false);
    expect(isUserImageSlot("capa")).toBe(false);
    expect(isUserImageSlot("BANNER")).toBe(false);
    expect(isUserImageSlot(undefined)).toBe(false);
    expect(isUserImageSlot(null)).toBe(false);
  });

  it("a mensagem do slot nomeia a lista", () => {
    expect(USER_IMAGE_SLOT_MESSAGE).toBe("Slot de imagem deve ser banner");
  });

  it("prefixo carrega o usuário e o slot", () => {
    expect(userImagePrefix(7, "banner")).toBe("users/7/images/banner");
  });

  it("id inválido não produz prefixo", () => {
    for (const bad of [0, -1, Number.NaN, 1.5, "12" as unknown as number]) {
      expect(() => userImagePrefix(bad, "banner")).toThrow(/usuário inválido/);
    }
  });
});
