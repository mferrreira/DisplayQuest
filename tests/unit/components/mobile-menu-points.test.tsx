/**
 * S02 (plan-v11, R2) — o bloco de pontos do menu mobile abre o quadro de liderança.
 *
 * Arquivo separado de `app-header-points.test.tsx` de propósito: aquele arquivo mocka o
 * MobileMenu para o teste do cabeçalho, e o mock compartilhado devolve `() => null` para o
 * menu — o primeiro teste mobile passou verde provando o substituto, não o sistema.
 *
 * Costuras medidas: `usePathname` exige Router context (mock); o `Sheet` do Radix depende dos
 * shims de `tests/setup.ts`; `userEvent.setup({ delay: null })`.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: {
      id: 4,
      name: "Carla Lima",
      email: "carla@test.local",
      roles: ["VOLUNTARIO"],
      points: 500,
    },
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/layout/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/layout/nav-item-link", () => ({
  NavItemLink: ({ item }: { item: { label: string } }) => <a href="/dashboard">{item.label}</a>,
}));

import { MobileMenu } from "@/components/layout/mobile-menu";

describe("S02 — placar do menu mobile abre o mesmo destino", () => {
  it("o bloco de pontos do menu é link para /dashboard/leaderboard", async () => {
    const user = userEvent.setup({ delay: null });
    render(<MobileMenu />);

    await user.click(screen.getByRole("button", { name: "Abrir menu" }));
    const link = screen.getByRole("link", { name: "Pontos — abrir quadro de liderança" });
    expect(link).toHaveAttribute("href", "/dashboard/leaderboard");
    expect(link).toHaveTextContent("500");
  });
});
