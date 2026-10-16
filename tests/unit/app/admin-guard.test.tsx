/**
 * V6-9 · AC-V6-32 (RF-V6.14 R3 / RF-V6.16 S3).
 *
 * A guarda de entrada do Painel Administrativo mora no SERVIDOR. Antes o `admin/page.tsx`
 * decidia no cliente com a lista inline de `DASHBOARD_ADMIN` e a negativa era um corpo servido
 * com HTTP 200; agora o `admin/layout.tsx` decide antes de o painel renderizar, e quem não porta
 * `DASHBOARD_ADMIN ∪ DASHBOARD_VOLUNTEERS` vê a frase de recusa — sem o painel.
 *
 * `getServerSession` é o seam: a sessão vem dele. O layout é uma função async de servidor, então
 * o teste a resolve e renderiza o resultado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getServerSessionMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));

import AdminDashboardLayout from "@/app/(dashboard)/dashboard/admin/layout";
import { canAccessAdminPanel } from "@/lib/utils/access-control";

const child = <div data-testid="painel">painel</div>;

async function renderLayout(roles: string[] | null) {
  getServerSessionMock.mockResolvedValue(
    roles === null ? null : { user: { id: 1, roles } },
  );
  const element = await AdminDashboardLayout({ children: child });
  render(element);
}

beforeEach(() => {
  getServerSessionMock.mockReset();
});

describe("canAccessAdminPanel — a decisão pura da entrada", () => {
  it("COORDENADOR e GERENTE entram por DASHBOARD_ADMIN", () => {
    expect(canAccessAdminPanel(["COORDENADOR"])).toBe(true);
    expect(canAccessAdminPanel(["GERENTE"])).toBe(true);
  });

  it("GERENTE_PROJETO entra por DASHBOARD_VOLUNTEERS (só a aba de Voluntários)", () => {
    expect(canAccessAdminPanel(["GERENTE_PROJETO"])).toBe(true);
  });

  it("nenhum outro papel entra", () => {
    expect(canAccessAdminPanel(["LABORATORISTA"])).toBe(false);
    expect(canAccessAdminPanel(["COLABORADOR"])).toBe(false);
    expect(canAccessAdminPanel(["VOLUNTARIO"])).toBe(false);
    expect(canAccessAdminPanel([])).toBe(false);
    expect(canAccessAdminPanel(null)).toBe(false);
    expect(canAccessAdminPanel(undefined)).toBe(false);
  });
});

describe("admin/layout — a negativa vem do servidor", () => {
  it("sem permissão, renderiza a frase de recusa e NÃO o painel", async () => {
    await renderLayout(["VOLUNTARIO"]);

    expect(screen.getByRole("heading", { name: "Acesso Negado" })).toBeInTheDocument();
    expect(
      screen.getByText("Você não tem permissão para acessar o painel administrativo."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("painel")).not.toBeInTheDocument();
  });

  it("com permissão, renderiza o painel", async () => {
    await renderLayout(["COORDENADOR"]);

    expect(screen.getByTestId("painel")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Acesso Negado" })).not.toBeInTheDocument();
  });

  it("GERENTE_PROJETO passa pela entrada (a restrição é por aba, não pela porta)", async () => {
    await renderLayout(["GERENTE_PROJETO"]);

    expect(screen.getByTestId("painel")).toBeInTheDocument();
  });
});
