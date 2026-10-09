/**
 * plan-v3 OND2-A — seam único de estado client-side.
 *
 * Existe por R11: sem um ponto único, cada componente que precisar guardar uma preferência
 * inventa o seu (chave, `try/catch`, guarda de SSR) e o próximo batch herda três
 * implementações diferentes. Estado medido na base em 2026-10-02: **zero** uso de
 * `localStorage` e **um** uso de `sessionStorage` — `components/ui/session-welcome-balloon.tsx`,
 * que guarda "dispensado" e o faz por sessão de navegador (a troca para localStorage mudaria
 * a semântica do aviso, então esse continua fora daqui por decisão, não por esquecimento).
 *
 * Regras do seam:
 *  - **namespace**: toda chave nasce com `dq:`, o que evita colisão com o que o navegador
 *    guarda de terceiros e torna `dq:` um prefixo greppável (e removível) no depurador;
 *  - **JSON tolerante**: valor corrompido (ou de outra versão do app) devolve o padrão em
 *    vez de estourar — texto quebrado em `localStorage` não pode derrubar a tela;
 *  - **SSR**: nenhuma função toca `window` no import; sem `window` (servidor, teste em
 *    `environment node`) toda leitura devolve o padrão e toda escrita devolve `false`;
 *  - **escrita nunca lança**: cota estourada ou storage bloqueado (aba anônima, cookies
 *    desligados) viram `false`, que o chamador pode ignorar sem try/catch espalhado.
 *
 * O módulo é puro de infraestrutura de navegador: não importa nada, e por isso serve para
 * `components/`, `features/`, `hooks/` e `lib/` sem cruzar nenhuma regra do gate (RG-01..RG-07).
 */

/** Prefixo de tudo que este seam grava. */
export const CLIENT_STORAGE_NAMESPACE = "dq:" as const;

/**
 * Monta a chave namespaced. Aceita número e `null`/`undefined` (que viram o texto do
 * próprio valor ignorado — melhor um item vazio do que um item com "undefined" na chave,
 * que quebraria a comparação na leitura seguinte).
 *
 *   clientStorageKey("session-notes", 42) === "dq:session-notes:42"
 */
export function clientStorageKey(...parts: Array<string | number | null | undefined>): string {
  const tail = parts
    .filter((part) => part !== null && part !== undefined && part !== "")
    .map((part) => String(part))
    .join(":");
  return `${CLIENT_STORAGE_NAMESPACE}${tail}`;
}

/** O storage do navegador, ou `null` fora do cliente. Não lança. */
function browserStorage(kind: ClientStorageKind): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = kind === "session" ? window.sessionStorage : window.localStorage;
    // Safari em modo privado lança no acesso, não só na escrita.
    return storage ?? null;
  } catch {
    return null;
  }
}

export type ClientStorageKind = "local" | "session";

/** `true` quando existe storage utilizável (isto é, estamos no cliente e ele respondeu). */
export function isClientStorageAvailable(kind: ClientStorageKind = "local"): boolean {
  return browserStorage(kind) !== null;
}

/** Lê texto cru. `null` quando não há storage ou a chave não existe. */
export function readText(
  key: string,
  kind: ClientStorageKind = "local",
): string | null {
  const storage = browserStorage(kind);
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Grava texto cru. Devolve `false` quando não gravou (SSR, cota, storage bloqueado). */
export function writeText(
  key: string,
  value: string,
  kind: ClientStorageKind = "local",
): boolean {
  const storage = browserStorage(kind);
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lê JSON. `fallback` (não `undefined`) quando não há storage, quando a chave não existe
 * e quando o conteúdo não é JSON — a leitura nunca lança.
 */
export function readJson<T>(key: string, fallback: T, kind: ClientStorageKind = "local"): T {
  const raw = readText(key, kind);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Grava JSON. Devolve `false` quando não gravou — inclusive quando o valor é `undefined`. */
export function writeJson(
  key: string,
  value: unknown,
  kind: ClientStorageKind = "local",
): boolean {
  if (value === undefined) return false;
  try {
    return writeText(key, JSON.stringify(value), kind);
  } catch {
    // `JSON.stringify` lança em ciclo ou BigInt; storage quebrado não derruba a interface.
    return false;
  }
}

/** Apaga a chave. Devolve `true` quando a chave não existe ao final (idempotente). */
export function removeItem(key: string, kind: ClientStorageKind = "local"): boolean {
  const storage = browserStorage(kind);
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}