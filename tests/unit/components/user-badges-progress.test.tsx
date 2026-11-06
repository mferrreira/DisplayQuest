/**
 * plan-v15 S10 (R7, CA4) + plan-v18 S02 (DEC-248, ADR-005) — o progresso não entra no bloco.
 *
 * O contrato hoje:
 *  - `progress` chega do servidor (`GET /api/user-badges` mantém a chave) e o bloco Badges
 *    do perfil não o renderiza — os chips "Em progresso" saíram da tela por decisão do dono;
 *  - com conquistadas, só os cartões; sem nenhuma conquistada, o aviso de vazio, sem chips;
 *  - o "X de Y" continua provado no domínio em tests/unit/domain/gamification/badge-progress.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getUserBadges = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/api-client", () => ({
  BadgesAPI: { getUserBadges },
}));

import { UserBadges } from "@/components/ui/user-badges";

function earned(id: number, name: string) {
  return {
    id,
    badgeId: id,
    userId: 1,
    earnedAt: new Date().toISOString(),
    equipped: false,
    badge: {
      id,
      name,
      description: "d",
      category: "achievement",
      criteria: null,
      slug: `s-${id}`,
      effect: null,
      iconKey: null,
      isActive: true,
    },
  };
}

describe("UserBadges — progresso fora do bloco (S02)", () => {
  beforeEach(() => {
    getUserBadges.mockReset();
  });

  it("conquistada + progressos: só o cartão, nenhum chip de progresso", async () => {
    getUserBadges.mockResolvedValue({
      badges: [earned(10, "Cinco Tarefas")],
      progress: [{ badgeId: 11, name: "Dez Tarefas", value: 7, target: 10 }],
    });
    render(<UserBadges userId={1} />);
    expect(await screen.findByTestId("badge-card")).toBeInTheDocument();
    expect(screen.queryByTestId("progress-label")).not.toBeInTheDocument();
    expect(screen.queryByText("7 de 10")).not.toBeInTheDocument();
    expect(screen.queryByText("Dez Tarefas")).not.toBeInTheDocument();
  });

  it("nenhuma conquistada: o aviso de vazio, sem chips de progresso", async () => {
    getUserBadges.mockResolvedValue({
      badges: [],
      progress: [{ badgeId: 11, name: "Dez Tarefas", value: 7, target: 10 }],
    });
    render(<UserBadges userId={1} />);
    expect(await screen.findByText("Nenhum badge conquistado ainda")).toBeInTheDocument();
    expect(screen.queryByTestId("progress-label")).not.toBeInTheDocument();
    expect(screen.queryByText("7 de 10")).not.toBeInTheDocument();
  });

  it("sem progressos: só as conquistadas em cartões", async () => {
    getUserBadges.mockResolvedValue({
      badges: [earned(10, "Cinco Tarefas")],
      progress: [],
    });
    render(<UserBadges userId={1} />);
    await screen.findByText("Cinco Tarefas");
    expect(screen.queryByTestId("progress-label")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("badge-card")).toHaveLength(1);
  });
});
