/**
 * plan-v17 S02 (R2, R3, R4, R5, C2, C3, ADR-002) — as badges equipadas no card de identidade.
 *
 * O card (capa, avatar, nome) mostra medálhões das equipadas: no máximo 3, do `earnedAt`
 * mais recente ao mais antigo; nunca unequipped, nunca progresso, nunca lista completa.
 * Sem equipada, nada de faixa, aviso, estado vazio. Nome só em tooltip.
 * Os dois cards montam a peça: perfil próprio (`page.tsx`) e perfil de terceiro
 * (`user-profile-view.tsx`) — o guard structural lê as duas fontes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";

import { ProfileBadgeShowcase } from "@/components/ui/profile-badge-showcase";

const getUserBadges = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/api-client", () => ({
  BadgesAPI: { getUserBadges },
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

describe("ProfileBadgeShowcase", () => {
  beforeEach(() => {
    getUserBadges.mockReset();
  });

  it("medálhões só das equipadas, na cor com o ícone real, sem nome em texto no card", async () => {
    getUserBadges.mockResolvedValue({
      badges: [
        earned(20, "Equipada A", { equipped: true }),
        earned(21, "Selo seco"),
        earned(22, "Equipada B", { equipped: true }),
      ],
      progress: [{ badgeId: 30, name: "Em progresso X", value: 1, target: 5 }],
    });
    render(<ProfileBadgeShowcase userId={2} />);

    const imgs = await screen.findAllByRole("img", { name: /^Ícone do / });
    expect(imgs.map((i) => i.getAttribute("alt"))).toEqual(["Ícone do Equipada A", "Ícone do Equipada B"]);
    expect(imgs[0].className).toContain("h-10");
    expect(screen.queryByText("Equipada A")).toBeNull();
    expect(screen.queryByText("Selo seco")).toBeNull();
    expect(screen.queryByText(/Em progresso X/)).toBeNull();
  });

  it("no máximo 3, do earnedAt mais recente ao mais antigo", async () => {
    getUserBadges.mockResolvedValue({
      badges: [
        earned(20, "Mais nova", { equipped: true, earnedAt: "2026-11-01" }),
        earned(21, "Média", { equipped: true, earnedAt: "2026-06-01" }),
        earned(22, "Mais antiga", { equipped: true, earnedAt: "2026-01-01" }),
        earned(23, "Antiga demais", { equipped: true, earnedAt: "2025-01-01" }),
      ],
    });
    render(<ProfileBadgeShowcase userId={2} />);

    const imgs = await screen.findAllByRole("img", { name: /^Ícone do / });
    expect(imgs.map((i) => i.getAttribute("alt"))).toEqual([
      "Ícone do Mais nova",
      "Ícone do Média",
      "Ícone do Mais antiga",
    ]);
  });

  it("sem equipadas: nada renderizado — a ausência é a surpresa", async () => {
    getUserBadges.mockResolvedValue({
      badges: [earned(20, "Selo seco")],
      progress: [],
    });
    const { container } = render(<ProfileBadgeShowcase userId={2} />);
    await waitFor(() => expect(getUserBadges).toHaveBeenCalledWith(2));
    expect(container).toBeEmptyDOMElement();
  });

  it("tooltip revela o nome: foco no medálhão abre o tooltip com nome e efeito", async () => {
    getUserBadges.mockResolvedValue({
      badges: [earned(20, "Equipada A", { equipped: true, badge: { id: 20, name: "Equipada A", description: "d", category: "achievement", iconKey: "badges/20/x.webp", effect: { kind: "bonus", pct: 0.1 }, isActive: true } })],
    });
    render(<ProfileBadgeShowcase userId={2} />);
    await screen.findByRole("img", { name: "Ícone do Equipada A" });
    const trigger = screen.getByLabelText("Badge equipado: Equipada A");
    expect(trigger).toHaveAttribute("tabindex", "0");
    fireEvent.focus(trigger);
    const tip = await screen.findByRole("tooltip", {}, { timeout: 2000 });
    expect(tip).toHaveTextContent("Equipada A");
    expect(tip).toHaveTextContent("+10% pontos");
  });

  it("os dois cards montam a peça: perfil próprio e perfil de terceiro", () => {
    const own = readFileSync("app/(dashboard)/dashboard/profile/page.tsx", "utf8");
    const third = readFileSync("components/ui/user-profile-view.tsx", "utf8");
    expect(own).toContain("<ProfileBadgeShowcase");
    expect(third).toContain("<ProfileBadgeShowcase");
  });

  it("plan-v18 S01-fix (DEC-250, dono 2026-11-06): a vitrine mora no canto direito, onde as roles estavam", () => {
    // Guard structural: as funções ficam NA coluna `min-w-0` (corte por contagem de
    // profundidade de div) e a vitrine fica FORA dela, dentro da coluna da direita
    // (`sm:items-end`). Guard frouxo de posição no arquivo não serve: ele passou uma
    // vez com as funções na coluna da direita (DEC-247), que é exatamente o desenho
    // que o dono recusou, e depois com a vitrine colada à esquerda (S01).
    function minW0Column(src: string): { slice: string; end: number } {
      const start = src.indexOf('<div className="min-w-0">');
      expect(start, src.slice(0, 40)).toBeGreaterThanOrEqual(0);
      let depth = 0;
      const scanner = /<div\b|<\/div>/g;
      scanner.lastIndex = start;
      let m: RegExpExecArray | null;
      while ((m = scanner.exec(src)) !== null) {
        depth += m[0] === "</div>" ? -1 : 1;
        if (depth === 0) return { slice: src.slice(start, m.index + m[0].length), end: m.index + m[0].length };
      }
      throw new Error("coluna min-w-0 sem fechamento");
    }

    for (const file of ["app/(dashboard)/dashboard/profile/page.tsx", "components/ui/user-profile-view.tsx"]) {
      const src = readFileSync(file, "utf8");
      const { slice, end } = minW0Column(src);
      expect(slice.indexOf("getRoleDisplayName"), `${file}: funções na coluna do nome`).toBeGreaterThanOrEqual(0);
      expect(slice.indexOf("<ProfileBadgeShowcase"), `${file}: vitrine fora da coluna do nome`).toBe(-1);
      const right = src.slice(end);
      const vitrine = right.indexOf("<ProfileBadgeShowcase");
      expect(vitrine, `${file}: vitrine depois da coluna do nome`).toBeGreaterThanOrEqual(0);
      const rightColumnStart = right.lastIndexOf('<div className="flex flex-col', vitrine);
      expect(rightColumnStart, `${file}: vitrine dentro de coluna`).toBeGreaterThanOrEqual(0);
      expect(right.slice(rightColumnStart, vitrine).includes("sm:items-end"), `${file}: coluna da direita`).toBe(true);
    }
  });
});
