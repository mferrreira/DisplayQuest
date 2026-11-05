/**
 * plan-v15 S02 (MODELO R15, demo do painel) — o picker de métricas do admin.
 *
 * O que este arquivo trava:
 *  - a lista de métricas do picker vem do registro fechado (os rótulos das métricas base);
 *  - a linha de cláusula (métrica + valor) produz criteria v2 no submit:
 *    `{version: 2, clauses: [{metric, op: ">=", value}]}`;
 *  - sem cláusula, o submit manda criteria null (badge de concessão manual).
 *
 * Lições aplicadas: o Select do Radix abre com `fireEvent` e as opções chegam um frame
 * depois (`findByRole`); os rótulos dos controles não se sobrepõem (lição do 3.C).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/contexts/api-client", () => ({ BadgesAPI: api }));

import { BadgeManager } from "@/components/admin/badge-manager";

describe("BadgeManager com picker de métricas", () => {
  beforeEach(() => {
    api.getAll.mockReset();
    api.getAll.mockResolvedValue({ badges: [] });
    api.create.mockReset();
    api.create.mockResolvedValue({ badge: { id: 1 } });
  });

  it("o picker lista as métricas do registro e o submit manda criteria v2", async () => {
    render(<BadgeManager />);

    // O primeiro render mostra o spinner; o `getAll` resolvido precisa ser flushado antes
    // do header e do trigger existirem.
    await screen.findByText("Gerenciar Badges");
    fireEvent.click(screen.getByText("Novo Badge"));
    const add = await screen.findByRole("button", { name: "Adicionar critério" });
    fireEvent.click(add);

    const trigger = screen.getByRole("combobox", { name: "Métrica do critério" });
    fireEvent.click(trigger);
    const labels = ["Tarefas concluídas", "Pontos", "Projetos", "Sessões de trabalho", "Média de horas semanais", "Dias consecutivos"];
    for (const label of labels) {
      await screen.findByRole("option", { name: label });
    }
    fireEvent.click(await screen.findByRole("option", { name: "Tarefas concluídas" }));

    fireEvent.change(screen.getByLabelText("Valor do critério"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Nome do Badge"), { target: { value: "Selo de Ferro" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Dez tarefas fechadas" } });

    fireEvent.click(screen.getByRole("button", { name: "Criar Badge" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0][0]).toMatchObject({
      name: "Selo de Ferro",
      criteria: { version: 2, clauses: [{ metric: "tasks_completed", op: ">=", value: 10 }] },
    });
  });

  it("sem cláusula, o submit manda criteria null", async () => {
    render(<BadgeManager />);

    await screen.findByText("Gerenciar Badges");
    fireEvent.click(screen.getByText("Novo Badge"));
    fireEvent.change(screen.getByLabelText("Nome do Badge"), { target: { value: "Selo Manual" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Concedido pela gestão" } });

    fireEvent.click(screen.getByRole("button", { name: "Criar Badge" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0][0].criteria).toBeNull();
  });

  it("a lista não quebra com badge de criteria legado sem cláusulas (seed antigo)", async () => {
    // O GET devolve o JSON cru da base: o seed antigo tem `criteria` sem `clauses`
    // (`{minHours: 10}`), e a lista não pode chamar `map` em cláusulas que não existem.
    api.getAll.mockResolvedValue({
      badges: [
        { id: 1, name: "Selo Antigo", description: "legado", category: "achievement", criteria: { minHours: 10 }, isActive: true, createdBy: 1 },
        { id: 2, name: "Selo V2", description: "v2", category: "milestone", criteria: { version: 2, clauses: [{ metric: "tasks_completed", op: ">=", value: 5 }] }, isActive: true, createdBy: 1 },
      ],
    });
    render(<BadgeManager />);
    await screen.findByText("Selo Antigo");
    expect(screen.getByText("Selo V2")).toBeInTheDocument();
    expect(screen.getByText(/Tarefas concluídas ≥ 5/)).toBeInTheDocument();
    // o legado não renderiza bloco de Critérios; só o v2 renderiza o seu
    expect(screen.getAllByText("Critérios:")).toHaveLength(1);
  });
});
