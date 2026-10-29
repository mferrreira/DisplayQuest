/**
 * S02 (plan-v11, R2) — o placar do cabeçalho abre o quadro de liderança.
 *
 * Por que existe: a pílula era um `div` sem destino; o ranking só era alcançável pela sidebar.
 * Os mocks são os mesmos do arquivo irmão `header-month-score.test.tsx` (razão idem: os filhos
 * montam contexto que o jsdom não sustenta aqui, e o que se mede é o destino da pílula).
 *
 * Costuras medidas da casa:
 *   - `userEvent` cru é lento sob carga paralela: `setup({ delay: null })`.
 *   - a abertura do `Sheet` do mobile depende dos shims de Radix em `tests/setup.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const fixtures = vi.hoisted(() => ({
  user: {
    id: 4,
    name: "Carla Lima",
    email: "carla@test.local",
    roles: ["VOLUNTARIO"],
    points: 500,
    completedTasks: 4,
    status: "active",
    weekHours: 20,
    currentWeekHours: 0,
    currentMonthPoints: 12,
    currentMonth: "2026-10",
    profileVisibility: "public",
    createdAt: new Date("2025-01-10T12:00:00.000Z"),
  } as Record<string, unknown>,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: fixtures.user,
    loading: false,
    error: null,
    logout: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
  }),
}));

vi.mock("@/components/layout/mobile-menu", () => ({ MobileMenu: () => null }));
vi.mock("@/components/layout/theme-toggle", () => ({ ThemeToggle: () => null }));

// `usePathname` exige Router context; fora do runtime Next o render de MobileMenu arrebenta
// e a árvore fica vazia — o mock devolve a rota atual.
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/components/ui/notifications-panel", () => ({ NotificationsPanel: () => null }));
vi.mock("@/components/ui/floating-session-timer", () => ({ FloatingSessionTimer: () => null }));

import { AppHeader } from "@/components/layout/app-header";

describe("S02 — placar do cabeçalho abre o quadro de liderança", () => {
  beforeEach(() => {
    fixtures.user = {
      id: 4,
      name: "Carla Lima",
      email: "carla@test.local",
      roles: ["VOLUNTARIO"],
      points: 500,
      completedTasks: 4,
      status: "active",
      weekHours: 20,
      currentWeekHours: 0,
      currentMonthPoints: 12,
      currentMonth: "2026-10",
      profileVisibility: "public",
      createdAt: new Date("2025-01-10T12:00:00.000Z"),
    };
  });

  it("a pílula do placar é link para /dashboard/leaderboard", () => {
    render(<AppHeader />);

    const link = screen.getByRole("link", { name: /placar do mês/i });
    expect(link).toHaveAttribute("href", "/dashboard/leaderboard");
    expect(link).toContainElement(screen.getByTestId("points-total"));
  });

  it("sem placar na sessão, a pílula não existe (nem link morto)", () => {
    delete (fixtures.user as Record<string, unknown>).currentMonthPoints;
    render(<AppHeader />);

    expect(screen.queryByRole("link", { name: /placar do mês/i })).toBeNull();
  });
});

