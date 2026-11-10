/**
 * plan-v18 S02 (DEC-248, ADR-005) — o bloco Badges é só-conquistadas em cartões largos.
 *
 * O que este arquivo trava:
 *  - cada conquistada é um cartão discreto (`data-testid="badge-card"`), mais largo que alto
 *    (geometria medida na captura; aqui entra a estrutura do cartão);
 *  - o cartão tem: medálhão com a rota do bucket quando há `iconKey`, nome, selo do efeito
 *    quando a badge tem passiva, e a data de conquista relativa;
 *  - zero chips de progresso: `progress` chega do servidor e o bloco não o renderiza.
 *
 * A lista "Em progresso" saiu da tela por decisão do dono (DEC-248). O GET
 * `/api/user-badges` continua devolvendo `progress` — o contrato da rota não muda.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const getUserBadges = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/api-client", () => ({
  BadgesAPI: { getUserBadges },
}));

import { UserBadges } from "@/components/ui/user-badges";

function earned(
  id: number,
  name: string,
  over: Record<string, unknown> = {},
) {
  const base = {
    id,
    badgeId: id,
    userId: 1,
    earnedAt: new Date().toISOString(),
    equipped: false,
    badge: {
      id,
      name,
      description: "d",
      icon: "sparkles",
      color: "#22c55e",
      category: "achievement",
      criteria: null,
      slug: `s-${id}`,
      effect: null,
      iconKey: `badges/${id}/icon.webp`,
      isActive: true,
    },
  };
  return { ...base, ...over, badge: { ...base.badge, ...(over.badge ?? {}) } };
}

describe("UserBadges — cartões largos (S02)", () => {
  beforeEach(() => {
    getUserBadges.mockReset();
  });

  it("cada conquistada é um cartão com medálhão, nome e data relativa", async () => {
    getUserBadges.mockResolvedValue({ badges: [earned(10, "Primeiras Tasks")], progress: [] });
    render(<UserBadges userId={1} />);
    const cards = await screen.findAllByTestId("badge-card");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText("Primeiras Tasks")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Hoje")).toBeInTheDocument();
    const img = within(cards[0]).getByRole("img");
    expect(img).toHaveAttribute(
      "src",
      expect.stringContaining("/api/badges/10/icon/file?v=badges%2F10%2Ficon.webp"),
    );
    expect(screen.getByText("Badges (1)")).toBeInTheDocument();
  });

  it("badge com passiva tem selo do efeito no cartão; sem passiva não tem selo", async () => {
    getUserBadges.mockResolvedValue({
      badges: [
        earned(10, "Passiva A", {
          badge: { effect: { kind: "bonus", pct: 0.1 } },
        }),
        earned(11, "Selo seco"),
      ],
      progress: [],
    });
    render(<UserBadges userId={1} />);
    const cards = await screen.findAllByTestId("badge-card");
    expect(cards).toHaveLength(2);
    const cardA = cards.find((c) => within(c).queryByText("Passiva A"))!;
    expect(within(cardA).getByText("Passiva: +10% pontos")).toBeInTheDocument();
    const cardB = cards.find((c) => within(c).queryByText("Selo seco"))!;
    expect(within(cardB).queryByText(/Passiva|Equipada/)).toBeNull();
  });

  it("zero chips de progresso: progress chega e o bloco não o renderiza", async () => {
    getUserBadges.mockResolvedValue({
      badges: [earned(10, "Cinco Tarefas")],
      progress: [{ badgeId: 11, name: "Dez Tarefas", value: 7, target: 10 }],
    });
    render(<UserBadges userId={1} />);
    await screen.findByTestId("badge-card");
    expect(screen.queryByTestId("progress-label")).not.toBeInTheDocument();
    expect(screen.queryByText("7 de 10")).not.toBeInTheDocument();
    expect(screen.queryByText("Dez Tarefas")).not.toBeInTheDocument();
  });

  it("nenhuma conquistada: o aviso de vazio, sem chips", async () => {
    getUserBadges.mockResolvedValue({
      badges: [],
      progress: [{ badgeId: 11, name: "Dez Tarefas", value: 7, target: 10 }],
    });
    render(<UserBadges userId={1} />);
    expect(await screen.findByText("Nenhum badge conquistado ainda")).toBeInTheDocument();
    expect(screen.queryByTestId("progress-label")).not.toBeInTheDocument();
    expect(screen.queryByText("7 de 10")).not.toBeInTheDocument();
  });
});