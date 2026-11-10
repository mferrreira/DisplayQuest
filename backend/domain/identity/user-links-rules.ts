import { ValidationError } from "../errors";

/**
 * UserLink — a linha gravada em `users.links`. `label` é o texto que a pessoa escreve;
 * `url` já é a forma que o servidor guarda, sempre com protocolo.
 */
export interface UserLink {
  label: string;
  url: string;
}

export const USER_LINK_LIMIT = 10;
export const USER_LINK_LABEL_MAX = 50;
export const USER_LINK_LIMIT_MESSAGE = "Máximo de 10 links";
export const USER_LINK_LABEL_MESSAGE = "Label do link deve ter no máximo 50 caracteres";
export const USER_LINK_URL_MESSAGE = "URL inválida";

/**
 * Normaliza a lista de links antes de gravar. Linhas vazias somem: o formulário permite
 * "Adicionar link" sem preencher, e uma linha em branco não é link. O protocolo ausente
 * entra com `https://`; ftp, javascript e afins não entram.
 */
export function normalizeUserLinks(value: unknown): UserLink[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError(USER_LINK_URL_MESSAGE);

  const out: UserLink[] = [];
  for (const item of value) {
    const raw = item as Record<string, unknown>;
    const label = String(raw.label ?? "").trim();
    const url = String(raw.url ?? "").trim();
    if (!label && !url) continue;

    if (label.length > USER_LINK_LABEL_MAX) {
      throw new ValidationError(USER_LINK_LABEL_MESSAGE);
    }

    const normalized = normalizeUserLinkUrl(url);
    if (!label) throw new ValidationError("Label do link é obrigatória");
    out.push({ label, url: normalized });
  }

  if (out.length > USER_LINK_LIMIT) {
    throw new ValidationError(USER_LINK_LIMIT_MESSAGE);
  }
  return out;
}

function normalizeUserLinkUrl(url: string): string {
  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url) ? url : `https://${url}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new ValidationError(USER_LINK_URL_MESSAGE);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ValidationError(USER_LINK_URL_MESSAGE);
  }
  if (!parsed.hostname) throw new ValidationError(USER_LINK_URL_MESSAGE);
  const root = parsed.pathname === "/" && !parsed.search && !parsed.hash;
  return root ? parsed.origin : parsed.toString();
}

/** Favicon derivado no render. Nada é persistido: o navegador puxa o ícone do serviço público. */
export function userLinkFavicon(url: string): string {
  const parsed = new URL(url);
  return `https://icons.duckduckgo.com/ip3/${parsed.hostname}.ico`;
}
