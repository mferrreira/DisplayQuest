import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectList } from "@/components/features/project-list";

const mocks = vi.hoisted(() => ({
  auth: { user: null as any },
  project: { projects: [] as any[], deleteProject: vi.fn(), loading: false },
  users: [] as any[],
}));

vi.mock("@/contexts/auth-context", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/project-context", () => ({ useProject: () => mocks.project }));
vi.mock("@/contexts/user-context", () => ({ useUser: () => ({ users: mocks.users }) }));
vi.mock("@/components/features/project-dialog", () => ({
  ProjectDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">Project dialog</div> : null,
}));

const projects = [
  { id: 1, name: "Projeto ativo", description: "Pesquisa atual", createdAt: "2026-01-02", createdBy: 7, status: "active" },
  { id: 2, name: "Projeto concluído", createdAt: "2025-05-01", createdBy: 7, status: "completed" },
  { id: 3, name: "Projeto arquivado", createdAt: "2024-03-01", createdBy: 7, status: "archived" },
] as any[];

beforeEach(() => {
  mocks.auth.user = { id: 7, roles: [] };
  mocks.project.projects = [];
  mocks.project.loading = false;
  mocks.project.deleteProject.mockReset();
  mocks.users = [];
});

describe("ProjectList characterization", () => {
  it("renders projects with their shared status labels", () => {
    render(<ProjectList projects={projects} />);
    expect(screen.getByText("Projeto ativo")).toBeVisible();
    expect(screen.getByText("Ativo")).toBeVisible();
    expect(screen.getByText("Concluído")).toBeVisible();
    expect(screen.getByText("Arquivado")).toBeVisible();
  });

  it("opens the project detail through the whole-card link (S01: the eye button is gone)", () => {
    const onProjectSelect = vi.fn();
    render(<ProjectList projects={[projects[0]]} onProjectSelect={onProjectSelect} />);
    const link = screen.getByRole("link", { name: "Ver projeto Projeto ativo" });
    expect(link).toHaveAttribute("href", "/dashboard/projetos/1");
    expect(screen.queryByRole("button", { name: "Ver projeto Projeto ativo" })).toBeNull();
  });

  it("shows management actions only to project managers", () => {
    const { rerender } = render(<ProjectList projects={[projects[0]]} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    mocks.auth.user = { id: 7, roles: ["GERENTE"] };
    rerender(<ProjectList projects={[projects[0]]} />);
    // 3 = "Novo Projeto" + editar + excluir. O olho não era contado aqui: sem
    // onProjectSelect ele não renderizava, e na S01 ele saiu por completo.
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});
