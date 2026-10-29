/**
 * S05 (plan-v11, R4) + fix do dono (2026-10-29) — a faixa de capa do projeto é 16:9.
 *
 * Por que existe: a faixa media `h-28 sm:h-36` — altura fixa, proporção que variava com a
 * largura da tela. S05 trocou para `aspect-video` (16:9). O dono passou a 21:9 e depois
 * voltou a 16:9, a mesma proporção do banner de perfil. O aceite congela `aspect-video` e a
 * ausência de altura fixa, nos dois estados (com capa e placeholder). Rede não é
 * exercitada: a regra aceita é de geometria, e os fluxos de upload/delete já estão congelados
 * no irmão user-media-header.
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
  it("com capa: o contêiner da imagem é aspect-video (16:9), sem altura fixa", () => {
    renderHeader("projects/3/images/banner/alpha.png", "projects/3/images/logo/alpha.png");
    const strip = screen.getByRole("img", { name: "Capa do projeto Alpha" }).parentElement!;
    expect(strip.className).toContain("aspect-video");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
    expect(screen.getByRole("img", { name: "Logo do projeto Alpha" })).not.toBeNull();
  });

  it("sem capa: o placeholder ocupa a mesma faixa 21:9", () => {
    renderHeader(null);
    const strip = screen.getByText("Sem capa").parentElement!;
    expect(strip.className).toContain("aspect-video");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
  });
});
