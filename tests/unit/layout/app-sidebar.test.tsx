import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * V6-2 · AppSidebar (RF-V6.3, AC-V6-08/09).
 * A sidebar desktop é construída a partir do nav-config — mesma filtragem por papel,
 * mesmo destino, ativo em destaque. O teste congela:
 *  - os destinos filtrados por papel (a sidebar não inventa destino — DEC-112);
 *  - o item ativo marcado com aria-current="page";
 *  - nenhum `rounded-full` nos itens (AC-V6-09, anti-pattern "Excessive pills").
 *
 * `next/link` e `next/navigation` são duplos: o jsdom desta base não monta o router do
 * Next, e o contrato testado é o shell (destinos/ativo/visual), não o roteador.
 */

const shell = vi.hoisted(() => ({
  pathname: "/dashboard",
  roles: [] as string[],
}));

vi.mock("next/navigation", () => ({
  usePathname: () => shell.pathname,
}));

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: (props: { href: string; children: React.ReactNode } & Record<string, unknown>) => {
      const { href, children, ...rest } = props;
      return createElement("a", { href, ...rest }, children);
    },
  };
});

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, name: "Teste", email: "t@example.com", roles: shell.roles, points: 10 },
    logout: () => {},
  }),
}));

import { AppSidebar } from "@/components/layout/app-sidebar";

beforeEach(() => {
  shell.pathname = "/dashboard";
  shell.roles = ["COORDENADOR"];
});

describe("AppSidebar (V6-2)", () => {
  it("renderiza os destinos do nav-config para o papel, com os rótulos da fonte", () => {
    render(<AppSidebar />);
    expect(screen.getByRole("link", { name: /Quadro de Tarefas/ })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /Painel Administrativo/ })).toBeInTheDocument();
    // lista plana como nas referências: o cabeçalho de grupo do nav-config NÃO é
    // renderizado na sidebar ("Pessoal" é só rótulo de grupo, não existe como item)
    expect(screen.queryByText("Pessoal")).not.toBeInTheDocument();
  });

  it("VOLUNTARIO não recebe destino que o papel não vê", () => {
    shell.roles = ["VOLUNTARIO"];
    render(<AppSidebar />);
    expect(screen.getByRole("link", { name: /Projetos/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Painel Administrativo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Relatórios Semanais/ })).not.toBeInTheDocument();
  });

  it("marca o item ativo com aria-current='page' (prefixo vale)", () => {
    shell.pathname = "/dashboard/projetos/42";
    render(<AppSidebar />);
    expect(screen.getByRole("link", { name: /Projetos/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Quadro de Tarefas/ })).not.toHaveAttribute("aria-current");
  });

  it("nenhum item de navegação usa rounded-full (AC-V6-09)", () => {
    const { container } = render(<AppSidebar />);
    for (const link of container.querySelectorAll("a")) {
      expect(link.className).not.toContain("rounded-full");
    }
  });
});
