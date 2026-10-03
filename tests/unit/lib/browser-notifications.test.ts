// @vitest-environment node
/**
 * plan-v3 — costura de notificação nativa (F1b). Criada no 2.C, ligada na 5.A (hoje
 * bloqueada por BLK-01: a instância é HTTP num IP de rede e o navegador recusa o pedido de
 * permissão fora de contexto seguro).
 *
 * O que este arquivo fixa é a **degradação**: o ponto de ligação da onda 5 vai chamar
 * `showBrowserNotification` em três situações ruins — navegador sem API, permissão negada,
 * contexto inseguro — e nenhuma delas pode virar exceção num evento de pausa. Também fixa
 * o dedupe por `tag`, que é o que impede a pilha de notificações de pausa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeOptions = {
  permission?: "granted" | "denied" | "default";
  isSecureContext?: boolean;
  requestResult?: "granted" | "denied" | "default";
  throwOnShow?: boolean;
  withoutRequestPermission?: boolean;
};

function installWindow(options: FakeOptions = {}) {
  const created: Array<{ title: string; options?: { tag?: string } }> = [];
  const closed: string[] = [];

  class FakeNotification {
    tag?: string;
    constructor(title: string, opts?: { tag?: string }) {
      if (options.throwOnShow) throw new Error("notificações bloqueadas");
      this.tag = opts?.tag;
      created.push({ title, options: opts });
    }
    close() {
      if (this.tag) closed.push(this.tag);
    }
  }

  const ctor = FakeNotification as unknown as {
    permission?: string;
    requestPermission?: () => Promise<string>;
  };
  ctor.permission = options.permission ?? "granted";
  if (!options.withoutRequestPermission) {
    ctor.requestPermission = () => Promise.resolve(options.requestResult ?? "granted");
  }

  vi.stubGlobal("window", {
    Notification: ctor,
    isSecureContext: options.isSecureContext ?? true,
  });

  return { created, closed };
}

async function loadModule() {
  vi.resetModules();
  return import("@/lib/notifications/browser-notifications");
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detecção de suporte", () => {
  it("sem window: nada é suportado", async () => {
    const { isBrowserNotificationSupported, canNotifyNow } = await loadModule();

    expect(typeof window).toBe("undefined");
    expect(isBrowserNotificationSupported()).toBe(false);
    expect(canNotifyNow()).toBe(false);
  });

  it("window sem Notification: suporta nada, e mostra nada", async () => {
    vi.stubGlobal("window", {});
    const {
      isBrowserNotificationSupported,
      canNotifyNow,
      showBrowserNotification,
      browserNotificationPermission,
    } = await loadModule();

    expect(isBrowserNotificationSupported()).toBe(false);
    expect(canNotifyNow()).toBe(false);
    expect(browserNotificationPermission()).toBe("unsupported");
    expect(() => showBrowserNotification("Pausa", { tag: "sessao" })).not.toThrow();
    expect(showBrowserNotification("Pausa", { tag: "sessao" })).toBe(false);
  });

  it("Notification que não é função (dublê quebrado) conta como ausente", async () => {
    vi.stubGlobal("window", { Notification: {} });
    const { isBrowserNotificationSupported, canNotifyNow } = await loadModule();

    expect(isBrowserNotificationSupported()).toBe(false);
    expect(canNotifyNow()).toBe(false);
  });
});

describe("contexto inseguro — o caso da instância atual", () => {
  it("mesmo com permissão concedida, não notifica fora de contexto seguro", async () => {
    installWindow({ permission: "granted", isSecureContext: false });
    const { canNotifyNow, showBrowserNotification } = await loadModule();

    // É o que acontece em http://<ip>:3000 — permissão GRANTED no passado não vale.
    expect(canNotifyNow()).toBe(false);
    expect(showBrowserNotification("Sessão pausada")).toBe(false);
  });
});

describe("permissão", () => {
  it("permissão negada: podeNotifyNow falso, mostra nada", async () => {
    installWindow({ permission: "denied" });
    const { browserNotificationPermission, canNotifyNow, showBrowserNotification } =
      await loadModule();

    expect(browserNotificationPermission()).toBe("denied");
    expect(canNotifyNow()).toBe(false);
    expect(showBrowserNotification("Sessão pausada")).toBe(false);
  });

  it("ainda não pedida (default): podeNotifyNow falso — pedir exige gesto", async () => {
    installWindow({ permission: "default" });
    const { browserNotificationPermission, canNotifyNow } = await loadModule();

    expect(browserNotificationPermission()).toBe("default");
    expect(canNotifyNow()).toBe(false);
  });

  it("pedido por gesto resolve com a permissão devolvida", async () => {
    installWindow({ permission: "default", requestResult: "granted" });
    const { requestBrowserNotificationPermission } = await loadModule();

    await expect(requestBrowserNotificationPermission()).resolves.toBe("granted");
  });

  it("navegador sem requestPermission (Safari antigo): 'unsupported', sem lançar", async () => {
    installWindow({ withoutRequestPermission: true });
    const { requestBrowserNotificationPermission } = await loadModule();

    await expect(requestBrowserNotificationPermission()).resolves.toBe("unsupported");
  });

  it("pedido que falha resolve como 'denied' em vez de rejeitar", async () => {
    installWindow({ permission: "default" });
    vi.stubGlobal("window", {
      Notification: Object.assign(class {}, {
        permission: "default",
        requestPermission: () => Promise.reject(new Error("gesto inválido")),
      }),
      isSecureContext: true,
    });
    const { requestBrowserNotificationPermission } = await loadModule();

    await expect(requestBrowserNotificationPermission()).resolves.toBe("denied");
  });
});

describe("mostrar, com dedupe por tag", () => {
  it("mostra quando pode, e registra a tag viva", async () => {
    const { created } = installWindow({ permission: "granted" });
    const { showBrowserNotification, liveBrowserNotificationTags } = await loadModule();

    expect(showBrowserNotification("Sessão pausada", { body: "12:00", tag: "sessao-pausa" })).toBe(
      true,
    );
    expect(created).toHaveLength(1);
    expect(created[0].title).toBe("Sessão pausada");
    expect(liveBrowserNotificationTags()).toEqual(["sessao-pausa"]);
  });

  it("mesma tag fecha a anterior em vez de empilhar", async () => {
    const { created, closed } = installWindow({ permission: "granted" });
    const { showBrowserNotification, liveBrowserNotificationTags } = await loadModule();

    showBrowserNotification("Pausa 12:00", { tag: "sessao-pausa" });
    showBrowserNotification("Pausa 15:00", { tag: "sessao-pausa" });
    showBrowserNotification("Pausa 17:00", { tag: "sessao-pausa" });

    expect(created).toHaveLength(3);
    // Duas fechadas (a primeira ao chegar a segunda, a segunda ao chegar a terceira).
    expect(closed).toEqual(["sessao-pausa", "sessao-pausa"]);
    expect(liveBrowserNotificationTags()).toEqual(["sessao-pausa"]);
  });

  it("tags diferentes convivem", async () => {
    const { created } = installWindow({ permission: "granted" });
    const { showBrowserNotification, liveBrowserNotificationTags } = await loadModule();

    showBrowserNotification("Pausa", { tag: "sessao-pausa" });
    showBrowserNotification("Responsabilidade", { tag: "plantao" });

    expect(created).toHaveLength(2);
    expect(liveBrowserNotificationTags().sort()).toEqual(["plantao", "sessao-pausa"]);
  });

  it("fechar por tag é idempotente e some do registro", async () => {
    const { closed } = installWindow({ permission: "granted" });
    const { showBrowserNotification, closeBrowserNotification, liveBrowserNotificationTags } =
      await loadModule();

    showBrowserNotification("Pausa", { tag: "sessao-pausa" });

    expect(closeBrowserNotification("sessao-pausa")).toBe(true);
    expect(closeBrowserNotification("sessao-pausa")).toBe(false);
    expect(closeBrowserNotification("tag-que-nunca-existiu")).toBe(false);
    expect(closed).toEqual(["sessao-pausa"]);
    expect(liveBrowserNotificationTags()).toEqual([]);
  });

  it("navegador que lança ao construir: false, sem exceção escaping", async () => {
    installWindow({ permission: "granted", throwOnShow: true });
    const { showBrowserNotification } = await loadModule();

    expect(() => showBrowserNotification("Pausa", { tag: "sessao-pausa" })).not.toThrow();
    expect(showBrowserNotification("Pausa", { tag: "sessao-pausa" })).toBe(false);
  });

  it("sem tag, nada é registrado e nada fecha", async () => {
    const { created, closed } = installWindow({ permission: "granted" });
    const { showBrowserNotification, liveBrowserNotificationTags } = await loadModule();

    expect(showBrowserNotification("Pausa")).toBe(true);
    showBrowserNotification("Outra pausa");

    expect(created).toHaveLength(2);
    expect(closed).toEqual([]);
    expect(liveBrowserNotificationTags()).toEqual([]);
  });
});