/**
 * Busca por texto que ignora maiúsculas e acentos.
 *
 * Fica em `lib/` porque dois componentes usam a mesma régua (o seletor de usuário
 * do diálogo de horários e o filtro de membros da grade), e régua duplicada é
 * régua que diverge: um corrige o acento e o outro esquece.
 */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

/** `true` quando `query` casa com nome ou e-mail, ignorando maiúsculas e acentos. */
export function matchesText(
  query: string,
  fields: (string | undefined | null)[],
): boolean {
  const term = foldText(query.trim())
  if (!term) return true
  return foldText(fields.filter(Boolean).join(" ")).includes(term)
}
