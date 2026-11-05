/**
 * plan-v15 S10 (R7, CA4) — o progresso "X de Y" no perfil.
 *
 * O que este arquivo trava:
 *  - com badge conquistada e progressos, a seção "Em progresso" aparece com o chip "7 de 10";
 *  - sem nenhuma conquistada, o chip de progresso aparece e o "Nenhum badge conquistado
 *    ainda" NÃO some da tela;
 *  - sem progressos, nenhuma seção extra aparece.
 *
 * O ratio da cláusula mais distante é conta do servidor (use case + porta de métricas);
 * a tela mostra o que veio na resposta, e a pureza da regra está em
 * tests/unit/domain/gamification/badge-progress.test.ts.
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
      isActive: true,
    },
  };
}

describe("UserBadges com progresso X de Y", () => {
  beforeEach(() => {
    getUserBadges.mockReset();
  });

  it("conquistada + progressos: seção 'Em progresso' com '7 de 10' e o nome da badge", async () => {
    getUserBadges.mockResolvedValue({
      badges: [earned(10, "Cinco Tarefas")],
      recentBadges: [],
      count: 1,
      progress: [{ badgeId: 11, name: "Dez Tarefas", value: 7, target: 10 }],
    });
    render(<UserBadges userId={1} />);
    await screen.findByText("Cinco Tarefas");
    expect(screen.getByTestId("progress-label")).toHaveTextContent("Em progresso");
    expect(screen.getByText("7 de 10")).toBeInTheDocument();
    expect(screen.getByText("Dez Tarefas")).toBeInTheDocument();
  });

  it("nenhuma conquistada: o chip de progresso substitui o aviso de vazio", async () => {
    getUserBadges.mockResolvedValue({
      badges: [],
      recentBadges: [],
      count: 0,
      progress: [{ badgeId: 11, name: "Dez Tarefas", value: 7, target: 10 }],
    });
    render(<UserBadges userId={1} />);
    expect(await screen.findByText("7 de 10")).toBeInTheDocument();
    expect(screen.getByTestId("progress-label")).toHaveTextContent("Em progresso");
    expect(screen.queryByText("Nenhum badge conquistado ainda")).not.toBeInTheDocument();
  });

  it("sem progressos: nenhuma seção extra, só as conquistadas", async () => {
    getUserBadges.mockResolvedValue({
      badges: [earned(10, "Cinco Tarefas")],
      recentBadges: [],
      count: 1,
      progress: [],
    });
    render(<UserBadges userId={1} />);
    await screen.findByText("Cinco Tarefas");
    expect(screen.queryByTestId("progress-label")).not.toBeInTheDocument();
  });
});
