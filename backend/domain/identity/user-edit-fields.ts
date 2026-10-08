/**
 * filterSelfEditableUserFields — a trava de campos do PUT /api/users/[id] (D4, B6-4).
 *
 * Medido na rota legado: quem tem MANAGE_USERS envia o corpo inteiro; quem NÃO tem (o próprio
 * usuário editando a si mesmo) tem o corpo FILTRADO a estes seis campos — `roles`, `status`,
 * `points`, `weekHours` e afins simplesmente não são escritos por quem não gerencia. A filtragem
 * era decisão de escopo na ROTA (o `Object.fromEntries` inline); ela é regra de negócio e mora
 * no domínio, aplicada pelo use case depois do gate self-or-manage.
 *
 * A lista é congelada como estava (inclusive `password`: o próprio usuário pode trocar a própria
 * senha por esta rota).
 */
export const SELF_EDITABLE_USER_FIELDS = [
  "name",
  "email",
  "bio",
  "avatar",
  "profileVisibility",
  "password",
] as const;

export function filterSelfEditableUserFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) =>
      (SELF_EDITABLE_USER_FIELDS as readonly string[]).includes(key),
    ),
  );
}
