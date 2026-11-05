/**
 * plan-v14 S04 (regra 4) — todo projeto com `bannerKey` na lista tem a faixa no cartão.
 *
 * Por que existe: o dono mediu banners ausentes na lista mesmo com capa enviada, com suspeita de
 * imagens duplicadas. A causa foi medida no docker em 2026-11-04: dados, payload e render. Os seis
 * projetos da instância têm `bannerKey` gravada, o payload da rota devolve as seis, e o DOM da
 * lista mostra uma faixa por projeto com capa — nenhum ausente. Os duplicados da medição são os
 * cartões criados pela sonda de upload, cada um com sua chave própria — nenhum cartão repete a
 * imagem de outro. Este arquivo congela a regra da presença: com `bannerKey` a faixa existe; sem
 * `bannerKey` o cartão não inventa faixa.
 *
 * Harness: `project-list.test.tsx` (S01, plan-v11) — os três contextos dobrados, `ProjectDialog`
 * no-op.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, name: "Ana", email: "ana@lab", roles: ["COORDENADOR"] } }),
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => ({ users: [{ id: 1, name: "Ana", email: "ana@lab" }] }),
}));

vi.mock("@/contexts/project-context", () => ({
  useProject: () => ({ projects: [], deleteProject: vi.fn(), loading: false }),
}));

vi.mock("@/components/features/project-dialog", () => ({
  ProjectDialog: () => null,
}));

import { ProjectList } from "@/components/features/project-list";
import type { Project } from "@/contexts/types";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 5,
    name: "Com capa",
    description: "Projeto",
    createdAt: "2026-01-01T12:00:00.000Z",
    createdBy: 1,
    leaderId: 1,
    status: "active",
    links: [],
    logoKey: null,
    bannerKey: "projects/5/images/banner/x.webp",
    ...overrides,
  };
}

describe("plan-v14 S04 — a faixa do cartão segue a `bannerKey` do payload", () => {
  it("projeto com `bannerKey`: a faixa existe e aponta o arquivo da chave", () => {
    render(
      <ProjectList
        projects={[makeProject(), makeProject({ id: 6, name: "Sem capa", bannerKey: null })]}
        showCreateButton={false}
      />
    );

    const banner = screen.getByRole("img", { name: "Capa do projeto Com capa" });
    expect(banner).toBeInTheDocument();
    expect(banner.getAttribute("src")).toContain("/api/projects/5/images/banner/file");
    expect(banner.getAttribute("src")).toContain(encodeURIComponent("projects/5/images/banner/x.webp"));
    // O recorte saiu: o `<img>` é cover simples, sem peça de recorte.
    expect(banner.closest('[data-banner-crop="true"]')).toBeNull();
  });

  it("projeto sem `bannerKey`: nenhum fundo inventado, nenhuma faixa no cartão", () => {
    render(
      <ProjectList
        projects={[makeProject({ id: 6, name: "Sem capa", bannerKey: null })]}
        showCreateButton={false}
      />
    );

    expect(screen.queryByRole("img", { name: "Capa do projeto Sem capa" })).toBeNull();
    expect(document.querySelectorAll('[data-banner-crop="true"]')).toHaveLength(0);
  });
});
