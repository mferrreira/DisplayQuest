/**
 * S05 (plan-v11, R4) — a faixa de capa do projeto no cabeçalho de mídia é 16:9.
 *
 * Por que existe: a faixa media `h-28 sm:h-36` — altura fixa, proporção que variava com a
 * largura da tela. O aceite congela `aspect-video` e a ausência de altura fixa, nos dois
 * estados (com capa e placeholder). Rede não é exercitada: a regra aceita é de geometria,
 * e os fluxos de upload/delete já estão congelados no irmão user-media-header.
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

describe("ProjectMediaHeader — faixa 16:9 (R4)", () => {
  it("com capa: o contêiner da imagem é aspect-video, sem altura fixa", () => {
    renderHeader("projects/3/images/banner/alpha.png", "projects/3/images/logo/alpha.png");
    const strip = screen.getByRole("img", { name: "Capa do projeto Alpha" }).parentElement!;
    expect(strip.className).toContain("aspect-video");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
    expect(screen.getByRole("img", { name: "Logo do projeto Alpha" })).not.toBeNull();
  });

  it("sem capa: o placeholder ocupa a mesma faixa 16:9", () => {
    renderHeader(null);
    const strip = screen.getByText("Sem capa").parentElement!;
    expect(strip.className).toContain("aspect-video");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
  });
});
