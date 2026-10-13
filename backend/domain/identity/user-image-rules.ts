/**
 * V5-3 (DEC-137) — imagem de usuário: slot de lista fechada de UM valor, `banner`.
 *
 * Mesma forma medida no V5-2d (DEC-135): o slot entra na CHAVE do bucket
 * (`users/<id>/images/<slot>`), então aceita-lo cru deixaria `users/7/images/<qualquer-coisa>` e a
 * chave deixaria de dizer o que é.
 *
 * O avatar continua no caminho legado (`public/uploads/avatars`, servido por
 * `/api/uploads/avatars/...`). Trazer o avatar para o bucket é outra decisão e não é este batch: o
 * plano (V5-3) pede capa de perfil, não migração de avatar.
 */
export const USER_IMAGE_SLOTS = ["banner"] as const;
export type UserImageSlot = (typeof USER_IMAGE_SLOTS)[number];

export const USER_IMAGE_SLOT_MESSAGE = "Slot de imagem deve ser banner";

export function isUserImageSlot(value: unknown): value is UserImageSlot {
  return typeof value === "string" && (USER_IMAGE_SLOTS as readonly string[]).includes(value);
}

/**
 * Prefixo de chave da imagem: `users/<id>/images/<slot>`.
 *
 * O id é conferido aqui pelo mesmo motivo do projeto e do anexo: o `sanitizeBlobPrefix` do seam só
 * protege contra traversal — `users/0/images/banner` é um caminho perfeitamente bem formado.
 */
export function userImagePrefix(userId: number, slot: UserImageSlot): string {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error(`usuário inválido para montar prefixo de imagem: ${userId}`);
  }
  return `users/${userId}/images/${slot}`;
}
