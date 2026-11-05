/**
 * plan-v15 S01 (MODELO R1, CA1) — o perfil mostra o badge v2 conquistado.
 *
 * O que este arquivo trava: com um `user_badges` cujo badge tem criteria v2, a tela de badges
 * do perfil renderiza o nome do badge e a contagem. A concessão em si é provada em
 * `badge-engine-v2.test.ts`; aqui entra só a leitura da tela.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getUserBadges = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/api-client", () => ({
  BadgesAPI: { getUserBadges },
}));

import { UserBadges } from "@/components/ui/user-badges";

describe("UserBadges com badge v2", () => {
  beforeEach(() => {
    getUserBadges.mockReset();
    getUserBadges.mockResolvedValue({
      badges: [
        {
          id: 1,
          badgeId: 10,
          userId: 1,
          earnedAt: new Date().toISOString(),
          badge: {
            id: 10,
            name: "Primeiras Tasks",
            description: "Concluiu as primeiras tarefas no sistema.",
            icon: "sparkles",
            color: "#22c55e",
            category: "achievement",
            criteria: { version: 2, clauses: [{ metric: "tasks_completed", op: ">=", value: 5 }] },
            isActive: true,
          },
        },
      ],
    });
  });

  it("mostra o nome do badge conquistado e a contagem", async () => {
    render(<UserBadges userId={1} />);

    await screen.findByText("Primeiras Tasks");
    expect(screen.getByText("Badges (1)")).toBeInTheDocument();
    expect(getUserBadges).toHaveBeenCalledWith(1, 6);
  });
});
