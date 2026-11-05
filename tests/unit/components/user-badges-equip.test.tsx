/**
 * plan-v17 S04 (R7, ADR-003 / DEC-246) — o bloco Badges é leitura, não equipar.
 *
 * O que este arquivo trava, depois que o equipar saiu do bloco e mudou para o picker da
 * Configurações (S03):
 *  - nenhum botão no bloco, nenhum contador "Equipadas" — o bloco não decide nada;
 *  - a equipada mantém o anel primary e o selo do efeito no chip;
 *  - o bloco acompanha o equipar do picker pelo cache compartilhado
 *    `lib/badges/equipped-sync` (a casa não tem QueryClientProvider montado).
 *
 * O contrato de equipar (alvo, frases do servidor, slots) mora em
 * `tests/unit/components/profile-settings-equip-picker.test.tsx` e na rota.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const getUserBadges = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/api-client", () => ({
  BadgesAPI: { getUserBadges },
}));

import { UserBadges } from "@/components/ui/user-badges";
import { markEquipped } from "@/lib/badges/equipped-sync";

function badge(id: number, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    badgeId: id,
    userId: 1,
    earnedAt: new Date().toISOString(),
    equipped: false,
    badge: {
      id,
      name,
      description: "d",
      category: "achievement",
      criteria: null,
      slug: `s-${id}`,
      effect: null,
      isActive: true,
    },
    ...over,
  };
}

describe("UserBadges — bloco de leitura (S04)", () => {
  beforeEach(() => {
    getUserBadges.mockReset();
    getUserBadges.mockResolvedValue({
      badges: [
        badge(10, "Passiva A", { badge: { id: 10, name: "Passiva A", description: "d", category: "achievement", criteria: null, slug: "s-10", effect: { kind: "bonus", pct: 0.1 }, isActive: true } }),
        badge(11, "Selo seco"),
        badge(12, "Passiva B", {
          equipped: true,
          badge: { id: 12, name: "Passiva B", description: "d", category: "achievement", criteria: null, slug: "s-12", effect: { kind: "penaltyReduction", pct: 0.15 }, isActive: true },
        }),
      ],
    });
  });

  it("nenhum botão, nenhum Equipadas — o bloco não equipar", async () => {
    render(<UserBadges userId={1} />);
    await screen.findByText("Passiva A");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText(/Equipadas/)).not.toBeInTheDocument();
    // a equipada continua visível como estado: selo do efeito + anel no chip
    expect(screen.getByText("-15% penalidade")).toBeInTheDocument();
    expect(screen.getByText("Passiva B").closest(".inline-flex")).toHaveClass("ring-2");
  });

  it("o bloco acompanha o equipar publicado no cache compartilhado", async () => {
    render(<UserBadges userId={1} />);
    await screen.findByText("Passiva A");
    act(() => markEquipped(1, 10, true));
    expect(await screen.findByText("+10% pontos")).toBeInTheDocument();
    act(() => markEquipped(1, 12, false));
    expect(screen.queryByText("-15% penalidade")).not.toBeInTheDocument();
  });
});
