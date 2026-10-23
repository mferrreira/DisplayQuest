/**
 * plan-v8 V8-7 (DEC-220) — o cartão da temporada do perfil.
 *
 * O que é congelado: o número que a tela mostra é o que o read model devolve, e o texto do próximo
 * degrau também (o domínio calcula `nextElo`/`xpToNextElo`). Nenhum cálculo de escada, de XP faltante
 * ou de slot acontece no componente — a régua é uma só e mora em `elo-rules.ts`.
 *
 * O componente é testado com `GamificationAPI` dobrada: a peça não tem outra forma de buscar, e o
 * contrato de HTTP das rotas novas é congelado em `gamification-read-routes.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { SeasonCard } from "@/components/ui/season-card";
import type { SeasonProgression } from "@/contexts/types";

const mocks = vi.hoisted(() => ({
  progression: null as SeasonProgression | null,
  fail: false,
}));

vi.mock("@/contexts/api-client", () => ({
  GamificationAPI: {
    getProgression: async () => {
      if (mocks.fail) throw new Error("Fora do ar");
      return { progression: mocks.progression };
    },
  },
}));

function progression(overrides: Partial<SeasonProgression> = {}): SeasonProgression {
  return {
    userId: 7,
    points: 40,
    xp: 940,
    coins: 5,
    elo: "OURO",
    trophySlots: 2,
    nextElo: "PLATINA",
    xpToNextElo: 560,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.fail = false;
  mocks.progression = progression();
});

describe("SeasonCard (V8-7)", () => {
  it("mostra o placar do mês com o vocabulário do ciclo mensal", async () => {
    render(<SeasonCard userId={7} />);

    // O skeleton de carregamento também tem heading, e ele é SUBSTITUÍDO quando a leitura chega: a
    // espera é por um texto que só existe no cartão carregado, e o heading é conferido depois.
    expect(await screen.findByText("Pontos do mês")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /temporada \d{4}/i })).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    // "acumulados" morreu com a virada: o placar fecha no fim do mês (DEC-212).
    expect(screen.queryByText(/acumulados/i)).not.toBeInTheDocument();
    expect(screen.getByText(/fecha no fim do mês/i)).toBeInTheDocument();
  });

  it("o próximo degrau vem do read model, com elo e XP faltante", async () => {
    render(<SeasonCard userId={7} />);

    expect(await screen.findByText(/Ouro · faltam 560 XP para Platina/i)).toBeInTheDocument();
  });

  it("no topo da escada não há próximo degrau", async () => {
    mocks.progression = progression({
      xp: 3600,
      elo: "DESAFIANTE",
      trophySlots: 3,
      nextElo: null,
      xpToNextElo: null,
    });

    render(<SeasonCard userId={7} />);

    expect(await screen.findByText(/Desafiante · elo máximo da temporada/i)).toBeInTheDocument();
    expect(screen.queryByText(/faltam \d+ XP/i)).not.toBeInTheDocument();
  });

  it("moeda é trilha vitalícia e slot é o teto do elo do momento", async () => {
    render(<SeasonCard userId={7} />);

    expect(await screen.findByText("Moedas")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/vitalícias/i)).toBeInTheDocument();
    expect(screen.getByText("Slots de troféu")).toBeInTheDocument();
    expect(screen.getByText(/equipar até 2 ao mesmo tempo/i)).toBeInTheDocument();
  });

  it("elo sem slot diz que não abre troféu, em vez de mostrar zero mudo", async () => {
    mocks.progression = progression({ xp: 10, elo: "BRONZE", trophySlots: 0, nextElo: "PRATA", xpToNextElo: 390 });

    render(<SeasonCard userId={7} />);

    expect(await screen.findByText(/ainda não abre slot de troféu/i)).toBeInTheDocument();
  });

  it("falha de leitura avisa em role=alert em vez de mostrar zeros", async () => {
    mocks.fail = true;

    render(<SeasonCard userId={7} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível ler/i);
  });
});
