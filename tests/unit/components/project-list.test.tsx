/**
 * S01 (plan-v11) — cartão de projeto com capa, logo e clique.
 *
 * Por que existe: ProjectList é montado por três contextos e o `tsc` não cobre a renderização.
 * Os três são mockados na forma que o componente consome hoje (`useAuth`, `useUser`,
 * `useProject`); o `ProjectDialog` é substituído por um no-op porque ele abre diálogos e
 * pesa o teste — o que este arquivo prova é o cartão, não o formulário.
 *
 * Costuras medidas da casa:
 *   - `userEvent` cru é lento sob carga: `setup({ delay: null })`.
 *   - o link esticado do cartão é uma única âncora; os controles de gestão ficam fora dela.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const authUser = { id: 1, name: "Ana", email: "ana@lab", roles: ["COORDENADOR"] };

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: authUser }),
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
    id: 9,
    name: "Alpha",
    description: "Projeto de laboratório",
    createdAt: "2026-01-01T12:00:00.000Z",
    createdBy: 1,
    leaderId: 1,
    status: "active",
    links: [],
    logoKey: "projects/9/images/logo",
    bannerKey: "projects/9/images/banner",
    ...overrides,
  };
}

describe("ProjectList — cartão com capa e logo, clique abre o detalhe", () => {
  beforeEach(() => {
    authUser.roles = ["COORDENADOR"];
  });

  it("mostra a capa e o logo do projeto no cartão", () => {
    render(<ProjectList projects={[makeProject()]} showCreateButton={false} />);

    const banner = screen.getByRole("img", { name: "Capa do projeto Alpha" });
    expect(banner).toBeInTheDocument();
    expect(banner.getAttribute("src")).toContain("/api/projects/9/images/banner/file");
    // A peça única (`BannerImage`) é a mesma do perfil e do pódio; o recorte saiu, o `<img>` é
    // cover simples. O cartão da lista mantém a altura própria, não a faixa 21:9.
    expect(banner.closest('[data-banner-crop="true"]')).toBeNull();

    const logo = screen.getByRole("img", { name: "Logo do projeto Alpha" });
    expect(logo).toBeInTheDocument();
    expect(logo.getAttribute("src")).toContain("/api/projects/9/images/logo/file");

    // A revisão da S01 exigiu: o banner fica num divisor com overflow-hidden, e o
    // logo é FORA dele — dentro, a metade que cruza a emenda é ceifada.
    const clip = banner.parentElement;
    expect(clip?.className).toContain("overflow-hidden");
    expect(logo.parentElement).not.toBe(clip);
    expect(logo.parentElement?.className).toContain("relative");
  });

  it("sem capa e sem logo, o cartão não inventa imagem", () => {
    render(
      <ProjectList
        projects={[makeProject({ logoKey: null, bannerKey: null })]}
        showCreateButton={false}
      />
    );

    expect(screen.queryByRole("img", { name: "Capa do projeto Alpha" })).toBeNull();
    expect(screen.queryByRole("img", { name: "Logo do projeto Alpha" })).toBeNull();
  });

  it("a faixa da capa no cartão é maior que a altura medida de h-16 sm:h-24 (plan-v13 S03)", () => {
    render(<ProjectList projects={[makeProject()]} showCreateButton={false} />);

    const banner = screen.getByRole("img", { name: "Capa do projeto Alpha" });
    // A peça única fica dentro do divisor de clip; a FAIXA é o div externo que declara a altura
    // (`relative h-24 sm:h-32`), e só ele tem as classes de altura.
    const clip = banner.parentElement?.parentElement;
    const strip = clip?.parentElement;
    const classes = strip?.className.split(/\s+/) ?? [];
    const h = classes.find((c) => /^h-\d+$/.test(c));
    const sm = classes.find((c) => /^sm:h-\d+$/.test(c));
    expect(h).toBeDefined();
    expect(sm).toBeDefined();
    expect(Number(h!.replace("h-", ""))).toBeGreaterThan(16);
    expect(Number(sm!.replace("sm:h-", ""))).toBeGreaterThan(24);
  });

  it("o cartão inteiro é link para o detalhe do projeto", () => {
    render(<ProjectList projects={[makeProject()]} showCreateButton={false} />);

    const link = screen.getByRole("link", { name: "Ver projeto Alpha" });
    expect(link).toHaveAttribute("href", "/dashboard/projetos/9");
  });

  it("o botão olho de acesso saiu do cartão, mesmo com onProjectSelect", () => {
    render(
      <ProjectList
        projects={[makeProject()]}
        showCreateButton={false}
        onProjectSelect={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Ver projeto Alpha" })
    ).toBeNull();
  });

  it("os controles de gestão continuam fora do link e funcionam", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectList projects={[makeProject()]} showCreateButton={false} />);

    const edit = screen.getByRole("button", { name: "Editar projeto Alpha" });
    await user.click(edit);
    expect(screen.getByRole("button", { name: "Excluir projeto Alpha" })).toBeInTheDocument();
  });
});
