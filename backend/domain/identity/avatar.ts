/**
 * Avatar policy — pure domain rule of the identity aggregate (OND2-B2, R2).
 *
 * Moved verbatim out of `UserServiceGateway.normalizeAvatar` (A11 hardening): an avatar is
 * `null`/empty or an INTERNAL path under /uploads/avatars/ (legacy) or /api/uploads/avatars/
 * (runtime). External URLs, protocol-relative paths, traversal (`..`) or paths outside the
 * prefixes are rejected with the frozen message (golden OND2-B1).
 */
import { ValidationError } from "../errors";

export function normalizeAvatar(raw: unknown): string | null {
  const value = raw ? String(raw) : "";
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("..") || !trimmed.startsWith("/")) {
    throw new ValidationError("Imagem de perfil inválida");
  }
  if (trimmed.startsWith("/uploads/avatars/")) return trimmed;
  if (trimmed.startsWith("/api/uploads/avatars/")) return trimmed;
  throw new ValidationError("Imagem de perfil inválida");
}
