/**
 * plan-v17 S03 (R6, R8, C4, ADR-003) — o picker de equipar na aba Configurações, em modo de edição.
 *
 * O picker lista só as conquistadas com passiva: medálhão, nome, efeito, contador
 * "Equipadas (n/3)", botão por badge. Frases do servidor (409 "Slots de passiva
 * cheios", 400 "Badge sem passiva não é equipável") chegam como role="alert".
 * A autoridade é a rota POST /api/user-badges/[userId]/[badgeId]/equip — o picker
 * não re-aritmética regra nenhuma. Guard structural: a peça só vive dentro do
 * bloco de edição da aba Configurações, acima do UserProfileForm.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";

import { ProfileBadgeEquipPicker } from "@/components/ui/profile-badge-equip-picker";

const getUserBadges = vi.hoisted(() => vi.fn());
const equip = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/api-client", () => ({
  BadgesAPI: { getUserBadges, equip },
}));

function earned(id: number, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    badgeId: id,
    userId: 2,
    earnedAt: "2026-10-01",
    equipped: false,
    badge: {
      id,
      name,
      description: "d",
      category: "achievement",
      color: "#22c55e",
      iconKey: `badges/${id}/x.webp`,
      effect: null,
      isActive: true,
    },
    ...over,
  };
}

function passive(id: number, name: string, over: Record<string, unknown> = {}) {
  return earned(id, name, {
    badge: {
      id,
      name,
      description: "d",
      category: "achievement",
      color: "#22c55e",
      iconKey: `badges/${id}/x.webp`,
      effect: { kind: "bonus", pct: 0.1 },
      isActive: true,
    },
    ...over,
  });
}

describe("ProfileBadgeEquipPicker", () => {
  beforeEach(() => {
    getUserBadges.mockReset();
    equip.mockReset();
    equip.mockResolvedValue({ userBadge: { equipped: true } });
  });

  it("lista só as passivas, com medálhão, efeito e contador n/3", async () => {
    getUserBadges.mockResolvedValue({
      badges: [passive(10, "Passiva A"), earned(11, "Selo seco"), passive(12, "Passiva B", { equipped: true })],
      progress: [{ badgeId: 30, name: "Em progresso X", value: 1, target: 5 }],
    });
    render(<ProfileBadgeEquipPicker userId={2} />);

    expect(await screen.findByText("Passiva A")).toBeInTheDocument();
    expect(screen.getByText("Passiva B")).toBeInTheDocument();
    expect(screen.queryByText("Selo seco")).toBeNull();
    expect(screen.queryByText(/Em progresso X/)).toBeNull();
    expect(screen.getByText("Equipadas (1/3)")).toBeInTheDocument();
    expect(screen.getAllByText("+10% pontos")).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Ícone do Passiva A" })).toHaveClass("h-10");
  });

  it("cliques chegam à rota com o alvo e o estado pedido; contador acompanha", async () => {
    getUserBadges.mockResolvedValue({ badges: [passive(10, "Passiva A"), passive(12, "Passiva B", { equipped: true })] });
    const user = userEvent.setup({ delay: null });
    render(<ProfileBadgeEquipPicker userId={2} />);

    await user.click(await screen.findByRole("button", { name: "Equipar Passiva A" }));
    expect(equip).toHaveBeenCalledWith(2, 10, true);
    expect(await screen.findByText("Equipadas (2/3)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Desequipar Passiva B" }));
    expect(equip).toHaveBeenLastCalledWith(2, 12, false);
    expect(await screen.findByText("Equipadas (1/3)")).toBeInTheDocument();
  });

  it("a recusa do servidor chega como role=alert com a frase congelada", async () => {
    getUserBadges.mockResolvedValue({
      badges: [
        ...[12, 13, 14].map((id) => passive(id, `Passiva ${id}`, { equipped: true })),
        passive(15, "Passiva 15"),
      ],
    });
    equip.mockRejectedValue(new Error("Slots de passiva cheios"));

    render(<ProfileBadgeEquipPicker userId={2} />);
    const user = userEvent.setup({ delay: null });

    await user.click(await screen.findByRole("button", { name: "Equipar Passiva 15" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Slots de passiva cheios");
    expect(screen.getByText("Equipadas (3/3)")).toBeInTheDocument();
  });

  it("sem passivas: estado vazio declarado, sem botões", async () => {
    getUserBadges.mockResolvedValue({ badges: [earned(11, "Selo seco")] });
    render(<ProfileBadgeEquipPicker userId={2} />);
    expect(await screen.findByText("Nenhuma badge com passiva")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/Equipadas/)).toBeNull();
  });

  it("falha de leitura avisa em role=alert, não estado vazio (padrão da casa)", async () => {
    getUserBadges.mockRejectedValue(new Error("Network error"));
    render(<ProfileBadgeEquipPicker userId={2} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar os badges");
    expect(screen.queryByText("Nenhuma badge com passiva")).toBeNull();
  });

  it("o picker mora só na edição da aba Configurações, acima do UserProfileForm", () => {
    const src = readFileSync("app/(dashboard)/dashboard/profile/page.tsx", "utf8");
    const editBlock = src.slice(src.indexOf("{showProfileForm && user ? ("), src.indexOf("<UserProfileForm"));
    expect(editBlock).toContain("<ProfileBadgeEquipPicker");
    expect(src).toContain("import { ProfileBadgeEquipPicker }");
  });
});
