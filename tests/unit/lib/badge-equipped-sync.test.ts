/**
 * plan-v17 S04 (should-fix da review S03, R7) — o cache compartilhado do equipar.
 *
 * Equipar acontece no picker da Configurações; as outras superfícies do perfil (bloco
 * Badges, vitrine do card) precisam acompanhar sem remontar. A casa não tem
 * QueryClientProvider montado, então a sincronização é este seam mínimo em `lib/`.
 *
 * O que este arquivo trava: o sinal vai só ao assinante daquele userId; unsubscribe
 * para de receber; assinantes múltiplos do mesmo usuário recebem todos.
 */
import { describe, expect, it, vi } from "vitest";

import { markEquipped, subscribeEquipped } from "@/lib/badges/equipped-sync";

describe("equipped-sync", () => {
  it("o assinante do usuário recebe o sinal; outro usuário não", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeEquipped(1, a);
    subscribeEquipped(2, b);

    markEquipped(1, 10, true);
    expect(a).toHaveBeenCalledWith(10, true);
    expect(b).not.toHaveBeenCalled();
  });

  it("unsubscribe para de receber; assinantes múltiplos do mesmo usuário recebem todos", () => {
    const a = vi.fn();
    const c = vi.fn();
    const unsubA = subscribeEquipped(3, a);
    subscribeEquipped(3, c);

    markEquipped(3, 11, false);
    expect(a).toHaveBeenCalledWith(11, false);
    expect(c).toHaveBeenCalledWith(11, false);

    unsubA();
    markEquipped(3, 12, true);
    expect(a).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(2);
  });

  it("sinal sem assinante não lança", () => {
    expect(() => markEquipped(99, 1, true)).not.toThrow();
  });
});
