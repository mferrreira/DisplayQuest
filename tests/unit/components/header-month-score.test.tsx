/**
 * plan-v9 S06 (ADR-007, DEC-229; MODELO §7, R13, CA10) — o cabeçalho anuncia o PLACAR DO MÊS.
 *
 * O número que a pílula do cabeçalho contava era `users.points`, o saldo acumulado (V4-2/DEC-59).
 * Com o placar do mês separado (ADR-001), cabeçalho e Quadro de Liderança podem dizer números
 * diferentes — e o dono respondeu D5: o cabeçalho mostra o **placar do mês** (`currentMonthPoints`),
 * o mesmo número que ordena o quadro, com o rótulo dizendo o que é. O saldo continua existe —
 * sai da pílula, e o perfil o apresenta.
 *
 * O que este arquivo fecha:
 *  - a pílula mostra o placar do mês e não o saldo, mesmo divergindo os dois;
 *  - a pílula tem o rótulo "Placar do mês" (sem "pontos" genérico que pareça saldo);
 *  - sem placar na sessão (sessão a meio do carregamento), a pílula não existe — a mesma regra
 *    que hoje esconde o contador sem `points`;
 *  - o chip segue anunciando o prêmio seguinte, montado dentro do cabeçalho (R13: "o chip
 *    continua anunciando o prêmio seguinte").
 *
 * A re-tarificação na virada do mês tem aceite próprio em `points-catch-up-month.test.tsx`.
 *
 * Medido nesta base (AGENTS.md): o jsdom do Vitest não tem `window.localStorage` nem
 * `window.matchMedia` — o stub do storage é instalado para a leitura da baseline mensal
 * responder de verdade; sem `matchMedia`, o caminho "movimento reduzido" é o que o componente
 * toma, e é esse caminho que as asserções de texto conjecturam.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";

import { AppHeader } from "@/components/layout/app-header";
import { announcePointsDelta, resetPointsDeltaStore } from "@/lib/points-delta";
import { writeLastSeenMonthPoints } from "@/lib/points-seen";

const fixtures = vi.hoisted(() => ({
  // Saldo e placar do mês divergentes de propósito: 500 é o que a pílula ANTES mostrava
  // (saldo), 12 é o que ordena o quadro. A divergência é a prova de que a leitura é do mês.
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
  // Cópia intacta: o caso "sessão sem placar" troca a sessão no meio do arquivo, e sem
  // restaurar aqui o teste seguinte montaria a pessoa errada (medido na primeira corrida).
  pristineUser: {} as Record<string, unknown>,
}));
fixtures.pristineUser = { ...fixtures.user };

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

// Os filhos do cabeçalho montam contexto/trilha efetch extra que o jsdom não sustenta neste
// arquivo (trabalho de sessões, notificações, tema). O que se mede aqui é a pílula e o chip.
vi.mock("@/components/layout/mobile-menu", () => ({ MobileMenu: () => null }));
vi.mock("@/components/layout/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/ui/notifications-panel", () => ({ NotificationsPanel: () => null }));
vi.mock("@/components/ui/floating-session-timer", () => ({ FloatingSessionTimer: () => null }));

/** Devolve o jsdom ao estado medido (sem storage). */
let storageMap: Map<string, string>;

function installLocalStorage() {
  storageMap = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (storageMap.has(key) ? storageMap.get(key)! : null),
      setItem: (key: string, value: string) => {
        storageMap.set(key, String(value));
      },
      removeItem: (key: string) => {
        storageMap.delete(key);
      },
      clear: () => storageMap.clear(),
      key: (index: number) => [...storageMap.keys()][index] ?? null,
      get length() {
        return storageMap.size;
      },
    },
  });
}

function pillText(): string {
  return screen.getByTestId("points-total").textContent ?? "";
}

function renderHeader() {
  return render(
    <StrictMode>
      <AppHeader />
    </StrictMode>,
  );
}

beforeEach(() => {
  resetPointsDeltaStore();
  installLocalStorage();
  // Cada caso parte da MESMA sessão: o caso "sem placar" troca a fixture, e sem restaurar o
  // caso seguinte montaria a pessoa errada.
  fixtures.user = { ...fixtures.pristineUser };
});

afterEach(() => {
  cleanup();
  resetPointsDeltaStore();
  delete (window as unknown as Record<string, unknown>).localStorage;
});

describe("S06 — o cabeçalho anuncia o placar do mês (ADR-007, DEC-229)", () => {
  it("a pílula conta o placar do mês, não o saldo", () => {
    renderHeader();
    expect(pillText()).toBe("12");
  });

  it("o número tem o rótulo que diz o que é", () => {
    renderHeader();
    expect(screen.getByText("Placar do mês")).toBeInTheDocument();
  });

  it("o saldo deixa de estar na pílula (e o perfil continua o lugar dele)", () => {
    renderHeader();
    const pill = screen.getByTestId("points-total");
    const pillContainer = pill.closest("div");
    expect(pillContainer?.textContent).not.toContain("500");
  });

  it("sem placar na sessão a pílula não existe (a regra de hoje sem a trilha)", () => {
    fixtures.user = { ...fixtures.user, currentMonthPoints: undefined };
    renderHeader();
    expect(screen.queryByTestId("points-total")).not.toBeInTheDocument();
  });

  it("baseline do MES ativo e sem mudança: número direto, sem chip", () => {
    writeLastSeenMonthPoints(4, "2026-10", 12);
    renderHeader();
    expect(pillText()).toBe("12");
    expect(screen.queryByTestId("points-delta")).not.toBeInTheDocument();
  });

  it("o chip continua anunciando o prêmio seguinte, montado no cabeçalho", () => {
    renderHeader();
    // `act`: o sinal chega por fora do React (a loja do `lib/points-delta.ts`), e sem o wrapper
    // a re-render do `useSyncExternalStore` não assenta antes da asserção.
    act(() => {
      expect(announcePointsDelta(15)).toBe(true);
    });
    const delta = screen.getByTestId("points-delta");
    expect(delta.textContent).toContain("+15");
  });
});
