/**
 * S05 (plan-v11, R4) + S04 (plan-v12, DEC-240) — a faixa de capa do projeto é 21:9.
 *
 * Por que existe: a faixa media `h-28 sm:h-36` — altura fixa, proporção que variava com a
 * largura da tela. S05 trocou para `aspect-video` (16:9); o dono chegou a pedir 21:9, voltou
 * a 16:9, e em 2026-11 fechou em 21:9 só para as faixas de capa. O aceite congela
 * `aspect-[21/9]` e a ausência de altura fixa, nos dois estados (com capa e placeholder).
 * Rede não é exercitada: a regra aceita é de geometria, e os fluxos de upload/delete já estão
 * congelados no irmão user-media-header.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProjectMediaHeader } from "@/components/features/project-media-header";

function renderHeader(bannerKey: string | null, logoKey: string | null = null) {
  return render(
    <ProjectMediaHeader
      projectId={3}
      projectName="Alpha"
      bannerKey={bannerKey}
      logoKey={logoKey}
      canManage={false}
    />
  );
}

describe("ProjectMediaHeader — faixa 21:9 (R4 + fix)", () => {
  it("com capa: o contêiner da imagem é aspect-[21/9] (16:9), sem altura fixa", () => {
    renderHeader("projects/3/images/banner/alpha.png", "projects/3/images/logo/alpha.png");
    const strip = screen.getByRole("img", { name: "Capa do projeto Alpha" }).parentElement!;
    expect(strip.className).toContain("aspect-[21/9]");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
    expect(screen.getByRole("img", { name: "Logo do projeto Alpha" })).not.toBeNull();
  });

  it("sem capa: o placeholder ocupa a mesma faixa 21:9", () => {
    renderHeader(null);
    const strip = screen.getByText("Sem capa").parentElement!;
    expect(strip.className).toContain("aspect-[21/9]");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
  });
});
