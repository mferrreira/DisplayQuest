import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * V6-2 · AppHeader reduzido (RF-V6.3 R3, DEC-106, AC-V6-08).
 * O <header> permanece no DOM (travado também por tests/e2e/shell.spec.ts) e fica só com
 * identidade + sino + tema + avatar; a navegação saiu dos pills do topo e foi para a
 * sidebar. Este teste é do ESTADO-ALVO da onda: header presente, controles presentes,
 * NENHUM destino de nav-config no header.
 *
 * NotificationsPanel e ThemeToggle são duplos: o primeiro busca em /api/notifications
 * (react-query + MSW) e o segundo exige o ThemeProvider do next-themes — nenhum dos dois
 * é o contrato deste teste, que é o esqueleto do shell.
 */

const shell = vi.hoisted(() => ({
  pathname: "/dashboard",
  roles: ["COORDENADOR"] as string[],
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

vi.mock("@/components/ui/notifications-panel", () => ({
  NotificationsPanel: () => <button type="button" aria-label="Notificações" />,
}));

vi.mock("@/components/layout/theme-toggle", () => ({
  ThemeToggle: () => <button type="button" aria-label="Alternar tema" />,
}));

import { AppHeader } from "@/components/layout/app-header";

beforeEach(() => {
  shell.pathname = "/dashboard";
  shell.roles = ["COORDENADOR"];
});

describe("AppHeader (V6-2)", () => {
  it("o <header> permanece no DOM com a identidade", () => {
    render(<AppHeader />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Display Quest/ })).toHaveAttribute("href", "/dashboard");
  });

  it("mantém sino, tema e avatar", () => {
    render(<AppHeader />);
    // o sino é montado duas vezes (cluster desktop + cluster compacto, medido no header
    // atual); o contrato é existir, não quantas vezes
    expect(screen.getAllByRole("button", { name: "Notificações" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Alternar tema" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Teste/ })).toBeInTheDocument();
  });

  it("NENHUM destino de navegação no header — a nav migrou para a sidebar", () => {
    render(<AppHeader />);
    for (const label of ["Quadro de Tarefas", "Painel Administrativo", "Relatórios", "Ranking"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });

  it("o gatilho do menu mobile (Sheet) continua no header (AC-V6-10)", () => {
    render(<AppHeader />);
    expect(screen.getByRole("button", { name: "Abrir menu" })).toBeInTheDocument();
  });

  it("oferece controle de hambúrguer para recolher e reabrir a sidebar desktop", () => {
    const onToggleSidebar = vi.fn();
    render(<AppHeader sidebarOpen onToggleSidebar={onToggleSidebar} />);
    const toggle = screen.getByRole("button", { name: "Recolher menu lateral" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "primary-navigation-sidebar");
    fireEvent.click(toggle);
    expect(onToggleSidebar).toHaveBeenCalledOnce();
  });
});
