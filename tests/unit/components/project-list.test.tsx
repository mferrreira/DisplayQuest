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

    const logo = screen.getByRole("img", { name: "Logo do projeto Alpha" });
    expect(logo).toBeInTheDocument();
    expect(logo.getAttribute("src")).toContain("/api/projects/9/images/logo/file");

    // A revisão da S01 exigiu: o corte do banner fica num divisor com overflow-hidden, e o
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
