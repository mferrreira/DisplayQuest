/**
 * plan-v8 V8-7 (DEC-220) — a prateleira de troféus do perfil.
 *
 * Congelado aqui é o COMPORTAMENTO DE TELA do equipar, que é a razão da V8-6 existir:
 *   1. a linha de slots é a frase do domínio (`trophySlotProgressLabel`), sobre a contagem LIDA da
 *      leitura — a tela não conta slot do próprio estado;
 *   2. o botão só existe para a própria pessoa (`canEquip`): no perfil do outro a prateleira é leitura
 *      (DEC-218, e o gate `requireActorSelf` está na rota);
 *   3. slot cheio desabilita o equipar e NUNCA desabilita o desequipar;
 *   4. a recusa do servidor chega como o servidor disse (409 com `trophySlotMessage`) e entra em
 *      `role="alert"` — a lição medida do V4-4b: rejeição sem aviso derruba o gate;
 *   5. o destaque de campeão vem dos ANOS do livro (`championYears`), não de olhar o nome na tela.
 *
 * A fake do equip aplica a MESMA conta do adaptador (`canEquipWithinSlots` sobre a contagem lida) e a
 * MESMA frase (`trophySlotMessage`): reimplementar a régua ou escrever um texto próprio é o modo de
 * falha da DEC-90. A contagem de verdade, o slot do elo lido do XP e a linha de auditoria ficam no
 * roundtrip e nos testes de rota (`trophy-equip-routes.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UserTrophies } from "@/components/ui/user-trophies";
import { TROPHY_NOT_EARNED_MESSAGE, canEquipWithinSlots, trophySlotMessage } from "@/backend/domain";
import type { UserTrophyEntry } from "@/contexts/types";

const SELF_ID = 7;

const mocks = vi.hoisted(() => ({
  owned: [] as UserTrophyEntry[],
  elo: "OURO" as string,
  slots: 2,
  calls: [] as Array<{ badgeId: number; action: string }>,
  readFails: false,
  /** Simula a janela que fechou entre a leitura e a escrita: o 409 da rota, dito pela frase do domínio. */
  forceRefusal: false,
}));

vi.mock("@/contexts/api-client", () => ({
  GamificationAPI: {
    getTrophies: async () => {
      if (mocks.readFails) throw new Error("Fora do ar");
      return { trophies: mocks.owned.map((entry) => ({ ...entry })) };
    },
    getProgression: async () => ({
      progression: {
        userId: SELF_ID,
        points: 0,
        xp: 940,
        coins: 0,
        elo: mocks.elo as never,
        trophySlots: mocks.slots,
        nextElo: "PLATINA" as never,
        xpToNextElo: 560,
      },
    }),
    changeTrophyEquip: async (_userId: number, badgeId: number, action: "equip" | "unequip") => {
      mocks.calls.push({ badgeId, action });
      const earned = mocks.owned.find((entry) => entry.badgeId === badgeId);
      if (!earned) throw new Error(TROPHY_NOT_EARNED_MESSAGE);

      const equippedCount = mocks.owned.filter((entry) => entry.equipped).length;
      if (action === "equip" && !earned.equipped) {
        if (mocks.forceRefusal || !canEquipWithinSlots(equippedCount, mocks.slots)) {
          throw new Error(trophySlotMessage(mocks.elo as never));
        }
        earned.equipped = true;
      }
      if (action === "unequip" && earned.equipped) earned.equipped = false;
      return {
        outcome: {
          userId: SELF_ID,
          badgeId,
          action,
          elo: mocks.elo,
          slots: mocks.slots,
          equippedBefore: equippedCount,
          equippedAfter: mocks.owned.filter((entry) => entry.equipped).length,
          unchanged: false,
        },
      };
    },
  },
}));

function trophy(overrides: Partial<UserTrophyEntry> & { userBadgeId: number; badgeId: number; name: string }): UserTrophyEntry {
  return {
    description: "descrição",
    equipped: false,
    earnedAt: "2026-01-01T03:05:00.000Z",
    effects: [],
    ...overrides,
  };
}

function seedOwned() {
  mocks.owned = [
    trophy({ userBadgeId: 5, badgeId: 22, name: "CAMPEÃO", description: "Fechou o ano em primeiro", effects: [{ verb: "pontos_tarefa", tier: "Tier2" }] }),
    trophy({ userBadgeId: 4, badgeId: 21, name: "MARCO DE 100 TAREFAS", equipped: true }),
  ];
}

beforeEach(() => {
  mocks.elo = "OURO";
  mocks.slots = 2;
  mocks.calls = [];
  mocks.readFails = false;
  mocks.forceRefusal = false;
  seedOwned();
});

describe("UserTrophies — a prateleira (V8-7)", () => {
  it("mostra os troféus com o slot do elo do momento e o efeito do catálogo", async () => {
    render(<UserTrophies userId={SELF_ID} canEquip />);

    expect(await screen.findByText("Troféus (2)")).toBeInTheDocument();
    // A linha de slots vem do domínio, sobre a contagem lida: 1 de 2 equipados.
    expect(screen.getByTestId("trophy-slot-progress")).toHaveTextContent("1 de 2 slots usados");
    expect(screen.getByTestId("trophy-slot-progress")).toHaveTextContent("elo Ouro");
    expect(screen.getByText(/Enquanto equipado/)).toBeInTheDocument();
    expect(screen.getByText(/Pontos de tarefa \+% Tier 2 \(10%\)/)).toBeInTheDocument();
    expect(screen.getByText("Equipado")).toBeInTheDocument();
    expect(screen.getByText("Na prateleira")).toBeInTheDocument();
  });

  it("no perfil do outro não há botão de equipar", async () => {
    render(<UserTrophies userId={SELF_ID} />);

    expect(await screen.findByText("Troféus (2)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /equipar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /desequipar/i })).not.toBeInTheDocument();
  });

  it("equipar manda a ação para o servidor, recarrega e mostra o estado novo", async () => {
    const user = userEvent.setup({ delay: null });
    render(<UserTrophies userId={SELF_ID} canEquip />);

    await user.click(await screen.findByRole("button", { name: "Equipar CAMPEÃO" }));

    expect(mocks.calls).toEqual([{ badgeId: 22, action: "equip" }]);
    // A linha de slots tem dois nós de texto (a frase do slot + o elo), então a asserção vai ao
    // testid do elemento, não à frase inteira (a lição do texto quebrado em nós múltiplos).
    expect(await screen.findByTestId("trophy-slot-progress")).toHaveTextContent(/2 de 2 slots usados/);
    // Os dois ficaram equipados: o rótulo de estado do CAMPEÃO mudou.
    expect(screen.getAllByText("Equipado")).toHaveLength(2);
  });

  it("slot cheio desabilita o equipar e mantém o desequipar livre", async () => {
    mocks.owned = [
      trophy({ userBadgeId: 5, badgeId: 22, name: "CAMPEÃO", equipped: true }),
      trophy({ userBadgeId: 4, badgeId: 21, name: "MARCO DE 100 TAREFAS", equipped: true }),
      trophy({ userBadgeId: 6, badgeId: 23, name: "SEM SLOT LIVRE" }),
    ];

    render(<UserTrophies userId={SELF_ID} canEquip />);

    const blocked = await screen.findByRole("button", { name: "Equipar SEM SLOT LIVRE" });
    expect(blocked).toBeDisabled();
    expect(screen.getByRole("button", { name: "Desequipar CAMPEÃO" })).toBeEnabled();

    await userEvent.setup({ delay: null }).click(blocked);
    expect(mocks.calls).toEqual([]);
  });

  it("a recusa do servidor chega como o servidor disse, em role=alert", async () => {
    // O botão nasce habilitado (há slot livre na leitura) e a recusa vem da ESCRITA: é o 409 real de
    // duas janelas que fecham ao mesmo tempo (outro clique, outra aba). A tela repete a frase do
    // domínio e não finge o estado novo.
    mocks.forceRefusal = true;
    const user = userEvent.setup({ delay: null });
    render(<UserTrophies userId={SELF_ID} canEquip />);

    const button = await screen.findByRole("button", { name: "Equipar CAMPEÃO" });
    expect(button).toBeEnabled();
    await user.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(trophySlotMessage("OURO"));
    // A tela não fingiu o estado: o troféu continua na prateleira.
    expect(mocks.owned.find((entry) => entry.badgeId === 22)?.equipped).toBe(false);
    expect(screen.getAllByText("Na prateleira")).toHaveLength(1);
  });

  it("os anos de campeão vêm do livro e aparecem como destaque", async () => {
    render(<UserTrophies userId={SELF_ID} canEquip championYears={[2025, 2023]} />);

    expect(await screen.findByTestId("trophy-champion-banner")).toHaveTextContent("Campeão 2025 · 2023");
  });

  it("sem campeão não há destaque inventado", async () => {
    render(<UserTrophies userId={SELF_ID} canEquip />);

    expect(await screen.findByText("Troféus (2)")).toBeInTheDocument();
    expect(screen.queryByTestId("trophy-champion-banner")).not.toBeInTheDocument();
  });

  it("falha de leitura avisa em texto em vez de fingir prateleira vazia", async () => {
    mocks.readFails = true;

    render(<UserTrophies userId={SELF_ID} canEquip />);

    expect(await screen.findByText(/Erro ao carregar os troféus/i)).toBeInTheDocument();
    expect(screen.queryByText(/Nenhum troféu conquistado/i)).not.toBeInTheDocument();
  });
});
