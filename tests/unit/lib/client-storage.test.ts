// @vitest-environment node
/**
 * plan-v3 OND2-A — o seam de estado client-side.
 *
 * O arquivo roda em `environment node` de propósito: nele não existe `window`, então é o
 * ambiente que representa o servidor (SSR) sem precisar simular. Um `window` falso com um
 * `localStorage` em memória representa o cliente — é o que permite provar o namespace, a
 * tolerância a JSON quebrado e a ausência de acesso no import.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLIENT_STORAGE_NAMESPACE,
  clientStorageKey,
  isClientStorageAvailable,
  readJson,
  readText,
  removeItem,
  writeJson,
  writeText,
} from "@/lib/client-storage";

/** localStorage em memória, com o mesmo contrato que importa: lança quando não pode. */
function fakeLocalStorage(options: { failWrites?: boolean; failReads?: boolean } = {}) {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key: string) {
      if (options.failReads) throw new Error("storage bloqueado");
      return data.has(key) ? (data.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      if (options.failWrites) throw new Error("cota estourada");
      data.set(key, value);
    },
    removeItem(key: string) {
      if (options.failWrites) throw new Error("cota estourada");
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    key() {
      return null;
    },
    get length() {
      return data.size;
    },
  };
}

type FakeWindow = { localStorage: ReturnType<typeof fakeLocalStorage>; sessionStorage: ReturnType<typeof fakeLocalStorage> };

function installWindow(local: FakeWindow["localStorage"] = fakeLocalStorage()) {
  const win = {
    localStorage: local,
    sessionStorage: fakeLocalStorage(),
  } as unknown as Window & typeof globalThis;
  vi.stubGlobal("window", win);
  return win;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("namespace", () => {
  it("toda chave nasce com o prefixo dq:", () => {
    expect(CLIENT_STORAGE_NAMESPACE).toBe("dq:");
    expect(clientStorageKey("session-notes", 42)).toBe("dq:session-notes:42");
  });

  it("partes vazias somem em vez de virar texto na chave", () => {
    expect(clientStorageKey("column-order", null, "to-do", undefined)).toBe("dq:column-order:to-do");
    expect(clientStorageKey("som", "")).toBe("dq:som");
  });

  it("chaves diferentes não colidem: o id da sessão entra na chave", () => {
    expect(clientStorageKey("session-notes", 1)).not.toBe(clientStorageKey("session-notes", 2));
  });
});

describe("leitura e escrita de texto", () => {
  it("escreve e lê de volta", () => {
    const local = fakeLocalStorage();
    installWindow(local);

    expect(writeText(clientStorageKey("som"), "ligado")).toBe(true);
    expect(local.data.has("dq:som")).toBe(true);
    expect(readText("dq:som")).toBe("ligado");
  });

  it("chave ausente devolve null, não undefined", () => {
    installWindow();
    expect(readText(clientStorageKey("inexistente"))).toBeNull();
  });

  it("removeItem é idempotente", () => {
    const local = fakeLocalStorage();
    installWindow(local);
    writeText("dq:x", "1");

    expect(removeItem("dq:x")).toBe(true);
    expect(removeItem("dq:x")).toBe(true);
    expect(readText("dq:x")).toBeNull();
  });
});

describe("JSON tolerante", () => {
  it("lê o que foi gravado", () => {
    installWindow();
    writeJson(clientStorageKey("ordem"), { coluna: "prazo" });
    expect(readJson("dq:ordem", null)).toEqual({ coluna: "prazo" });
  });

  it("conteúdo corrompido devolve o padrão e não derruba a tela", () => {
    const local = fakeLocalStorage();
    local.data.set("dq:ordem", "{isto nao e json");
    installWindow(local);

    expect(() => readJson("dq:ordem", { coluna: "urgencia" })).not.toThrow();
    expect(readJson("dq:ordem", { coluna: "urgencia" })).toEqual({ coluna: "urgencia" });
  });

  it("JSON de outra versão (array no lugar de objeto) volta cru, sem inventar valor", () => {
    const local = fakeLocalStorage();
    local.data.set("dq:ordem", JSON.stringify(["prazo", "urgencia"]));
    installWindow(local);

    expect(readJson<{ coluna: string }>("dq:ordem", { coluna: "urgencia" })).toEqual([
      "prazo",
      "urgencia",
    ]);
  });

  it("undefined não vira a string 'undefined' no storage", () => {
    const local = fakeLocalStorage();
    installWindow(local);

    expect(writeJson("dq:ordem", undefined)).toBe(false);
    expect(local.data.size).toBe(0);
  });

  it("valor não serializável (ciclo) não derruba a escrita", () => {
    installWindow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(writeJson("dq:ordem", cyclic)).toBe(false);
  });
});

describe("storage que falha", () => {
  it("escrita com cota estourada devolve false, sem lançar", () => {
    installWindow(fakeLocalStorage({ failWrites: true }));

    expect(writeText("dq:som", "x")).toBe(false);
    expect(writeJson("dq:som", { a: 1 })).toBe(false);
    expect(removeItem("dq:som")).toBe(false);
  });

  it("leitura com storage bloqueado devolve o padrão, sem lançar", () => {
    installWindow(fakeLocalStorage({ failReads: true }));

    expect(readText("dq:som")).toBeNull();
    expect(readJson("dq:som", "padrao")).toBe("padrao");
  });
});

describe("fora do cliente (SSR)", () => {
  it("não existe window: leitura devolve padrão e escrita devolve false", () => {
    expect(typeof window).toBe("undefined");
    expect(isClientStorageAvailable()).toBe(false);
    expect(readText("dq:som")).toBeNull();
    expect(readJson("dq:som", { ligado: false })).toEqual({ ligado: false });
    expect(writeText("dq:som", "x")).toBe(false);
    expect(writeJson("dq:som", { ligado: true })).toBe(false);
    expect(removeItem("dq:som")).toBe(false);
  });

  it("o módulo é importável sem window (nenhum acesso no topo)", async () => {
    await expect(import("@/lib/client-storage")).resolves.toBeDefined();
  });
});

describe("escolha do storage", () => {
  it("session não encosta no local e vice-versa", () => {
    const local = fakeLocalStorage();
    const session = fakeLocalStorage();
    const win = { localStorage: local, sessionStorage: session } as unknown as Window &
      typeof globalThis;
    vi.stubGlobal("window", win);

    writeText(clientStorageKey("aviso"), "1", "session");

    expect(session.data.has("dq:aviso")).toBe(true);
    expect(local.data.size).toBe(0);
    expect(readText(clientStorageKey("aviso"), "session")).toBe("1");
    expect(readText(clientStorageKey("aviso"), "local")).toBeNull();
  });
});