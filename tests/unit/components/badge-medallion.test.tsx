/**
 * plan-v17 S01 (R1, C1, ADR-001) — fonte única de ícone de badge.
 *
 * Cadeia fechada do medálhão: imagem do bucket (rota autenticada com `?v=<chave>`) >
 * texto `icon` sobre `color` > Lucide da categoria. Chips, medálhões do card e picker
 * consomem a mesma peça. O rótulo de categoria vem do domínio, não de cópia na tela.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { BadgeMedallion, type MedallionBadge } from "@/components/ui/badge-medallion";
import { badgeCategoryLabel } from "@/backend/domain";

function b(over: Partial<MedallionBadge> = {}): MedallionBadge {
  return {
    id: 3,
    name: "Selo 3",
    iconKey: null,
    icon: null,
    color: null,
    category: "achievement",
    ...over,
  };
}

describe("BadgeMedallion", () => {
  it("chave → img da rota autenticada, com a chave como quebra de cache, em círculo", () => {
    render(<BadgeMedallion badge={b({ iconKey: "badges/3/x.webp" })} size="md" />);
    const img = screen.getByRole("img", { name: "Ícone do Selo 3" });
    expect(img.getAttribute("src")).toContain("/api/badges/3/icon/file");
    expect(img.getAttribute("src")).toContain("v=badges%2F3%2Fx.webp");
    expect(img.className).toContain("rounded-full");
  });

  it("sem chave: o texto `icon` sobre a cor do badge, sem img", () => {
    render(<BadgeMedallion badge={b({ icon: "trophy", color: "#f59e0b" })} size="md" />);
    expect(screen.queryByRole("img")).toBeNull();
    const glyph = screen.getByText("trophy");
    expect(glyph.closest("span[style]")?.getAttribute("style")).toContain("background-color");
  });

  it("sem chave e sem texto: o Lucide da categoria, sem img", () => {
    const { container } = render(<BadgeMedallion badge={b()} size="md" />);
    expect(screen.queryByRole("img")).toBeNull();
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("class")).toContain("trophy");
  });

  it("tamanhos: sm é o glifo do chip, md é o círculo de showcase", () => {
    const { container: sm } = render(<BadgeMedallion badge={b()} size="sm" />);
    const { container: md } = render(<BadgeMedallion badge={b()} size="md" />);
    expect(sm.firstChild).toHaveClass("h-4", "w-4");
    expect(md.firstChild).toHaveClass("h-10", "w-10", "rounded-full");
  });

  it("rótulo de categoria vem do domínio, numa fonte só", () => {
    expect(badgeCategoryLabel("achievement")).toBe("Conquista");
    expect(badgeCategoryLabel("milestone")).toBe("Marco");
    expect(badgeCategoryLabel("special")).toBe("Especial");
    expect(badgeCategoryLabel("social")).toBe("Social");
  });
});
