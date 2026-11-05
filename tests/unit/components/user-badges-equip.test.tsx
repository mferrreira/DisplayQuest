/**
 * plan-v15 S04 (R9, CA5) — os controles de equipar no perfil.
 *
 * O que este arquivo trava, na tela do perfil com `canEquip`:
 *  - badge com passiva, desequipado, tem botão "Equipar <nome>";
 *  - badge equipado mostra o selo do efeito ("+10% pontos") e botão "Desequipar";
 *  - badge sem passiva não ganha botão nenhum;
 *  - o cabeçalho diz "Equipadas (n/3)";
 *  - quando o servidor recusa a 4ª equipagem, a frase do 409 aparece como `role="alert"`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getUserBadges = vi.hoisted(() => vi.fn());
const equip = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/api-client", () => ({
  BadgesAPI: { getUserBadges, equip },
}));

import { UserBadges } from "@/components/ui/user-badges";

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

describe("UserBadges com controles de equipar", () => {
  beforeEach(() => {
    getUserBadges.mockReset();
    equip.mockReset();
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
    equip.mockResolvedValue({ userBadge: { equipped: true } });
  });

  it("mostra Equipar para a passiva desequipada, o selo do efeito na equipada, e nada para o selo seco", async () => {
    render(<UserBadges userId={1} canEquip />);

    await screen.findByText("Passiva A");
    const equipar = await screen.findByRole("button", { name: "Equipar Passiva A" });
    expect(equipar).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desequipar Passiva B" })).toBeInTheDocument();
    expect(screen.getByText("-15% penalidade")).toBeInTheDocument();
    expect(screen.getByText("Equipadas (1/3)")).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
  });

  it("cliques chegam à API com o alvo e o estado pedido", async () => {
    const user = userEvent.setup({ delay: null });
    render(<UserBadges userId={1} canEquip />);

    await user.click(await screen.findByRole("button", { name: "Equipar Passiva A" }));
    expect(equip).toHaveBeenCalledWith(1, 10, true);
    expect(await screen.findByText("Equipadas (2/3)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Desequipar Passiva B" }));
    expect(equip).toHaveBeenLastCalledWith(1, 12, false);
    expect(await screen.findByText("Equipadas (1/3)")).toBeInTheDocument();
  });

  it("a recusa do servidor vira o aviso da tela: 4ª equipagem anuncia 'Slots de passiva cheios'", async () => {
    getUserBadges.mockResolvedValue({
      badges: [
        ...[12, 13, 14].map((id) =>
          badge(id, `Passiva ${id}`, {
            equipped: true,
            badge: { id, name: `Passiva ${id}`, description: "d", category: "achievement", criteria: null, slug: `s-${id}`, effect: { kind: "bonus", pct: 0.05 }, isActive: true },
          }),
        ),
        badge(15, "Passiva 15", {
          badge: { id: 15, name: "Passiva 15", description: "d", category: "achievement", criteria: null, slug: "s-15", effect: { kind: "bonus", pct: 0.05 }, isActive: true },
        }),
      ],
    });
    equip.mockRejectedValue(new Error("Slots de passiva cheios"));

    render(<UserBadges userId={1} canEquip />);
    const user = userEvent.setup({ delay: null });

    await user.click(await screen.findByRole("button", { name: "Equipar Passiva 15" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Slots de passiva cheios");
    expect(screen.getByText("Equipadas (3/3)")).toBeInTheDocument();
  });

  it("sem canEquip não há controles — ver o perfil de outro usuário não equipar", async () => {
    render(<UserBadges userId={2} />);
    await screen.findByText("Passiva A");
    expect(screen.queryByRole("button", { name: "Equipar Passiva A" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Equipadas/)).not.toBeInTheDocument();
  });
});
