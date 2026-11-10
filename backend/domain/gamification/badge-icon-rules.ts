/**
 * Regras puras de ícone de badge (plan-v16 S01, R1/INV4, DEC-243).
 *
 * A chave do bucket só sai daqui — prefixo fechado `badges/<id>`, como
 * `projects/<id>/images/<slot>` (DEC-102) e `users/<id>/images/banner` (DEC-137).
 * Nenhum string cru de caminho entra no código: o prefixo é a única fonte da chave.
 * O teto de 160 caracteres comporta a chave real (`badges/12/<uuid>.webp` ≈ 55).
 */
import { ValidationError } from "@/backend/domain/errors/DomainError";

export const BADGE_ICON_KEY_MAX = 160;

export function badgeIconPrefix(badgeId: number): string {
  if (!Number.isInteger(badgeId) || badgeId <= 0) {
    throw new ValidationError("Badge inválido")
  }
  return `badges/${badgeId}`
}

/** Normaliza a chave vinda da escrita: texto aparado; vazia vira null. */
export function normalizeBadgeIconKey(iconKey: unknown): string | null {
  if (iconKey == null) return null
  const key = String(iconKey).trim()
  if (!key) return null
  if (key.length > BADGE_ICON_KEY_MAX) {
    throw new ValidationError("Chave de ícone de badge inválida")
  }
  return key
}
