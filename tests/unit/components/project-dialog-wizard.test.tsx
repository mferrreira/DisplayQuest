/**
 * V5-5b (DEC-100) — testes do wizard de criação de projeto.
 *
 * Por que existe: o DEC-100 mudou a forma da criação (dados → equipe opcional → cronograma
 * opcional → cria), e nada disso é coberto por teste de rota: a rota recebe o corpo pronto. O
 * que este arquivo congela é o comportamento da tela, incluindo o que a tela NÃO manda —
 * pular o passo tem que sair do corpo como ausência, porque é isso que deixa a criação idêntica
 * à de antes (regra 9 do plano).
 *
 * Os três contextos do diálogo são substituídos por duplos que gravam o payload recebido. O
 * duplo do `createProject` não reimplementa regra nenhuma: ele só guarda o `ProjectFormData` que
 * a tela montou, e as asserções são sobre esse corpo.
 *
 * Costura medida:
 *   - input de data não aceita digitação caractere a caractere no jsdom; `fireEvent.change` com
 *     o valor completo é o caminho.
 *   - o factory do `vi.mock` roda antes do corpo do arquivo: nada dos helpers é chamado ali, só
 *     dentro das funções que executam na renderização.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProjectDialog } from "@/components/features/project-dialog";
import { ACTIVITY_MIN_MONTH_MESSAGE, addMonths, monthColumnLabel } from "@/backend/domain";
import { todayDateOnly } from "@/lib/date-only";
import type { ProjectFormData } from "@/contexts/types";

const captured = { payload: null as ProjectFormData | null };
const users = [
  { id: 1, name: "Coordenadora Ana", roles: ["COORDENADOR"] },
  { id: 4, name: "Bolsista Bruno", roles: ["VOLUNTARIO"] },
];

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, name: "Coordenadora Ana", roles: ["COORDENADOR"] } }),
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => ({ users: usersRef() }),
}));

vi.mock("@/contexts/project-context", () => ({
  useProject: () => ({
    async createProject(data: ProjectFormData) {
      captured.payload = data;
      return { id: 99 } as never;
    },
    async updateProject() {
      return {} as never;
    },
  }),
}));

// Só uma função: o factory é hoisted e chamar um valor do corpo ali cai em TDZ.
function usersRef() {
  return users as never;
}

function renderDialog(project?: never) {
  return render(
    <ProjectDialog open onOpenChange={vi.fn()} project={project} />,
  );
}

async function goToCronogramaStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nome do Projeto"), "Projeto Cronograma");
  await user.click(screen.getByRole("button", { name: "Avançar" }));
  await user.click(screen.getByRole("button", { name: "Avançar" }));
}

beforeEach(() => {
  captured.payload = null;
});

describe("wizard de criação de projeto", () => {
  it("abre no passo 1 de 3 e Avançar percorre os três passos", async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog();

    expect(screen.getByText("Passo 1 de 3: Dados do projeto")).toBeInTheDocument();
    expect(screen.queryByText("Líder do Projeto")).not.toBeInTheDocument();

    await goToCronogramaStep(user);

    expect(screen.getByText("Passo 3 de 3: Cronograma")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voltar" })).toBeInTheDocument();
  });

  it("sem nome não se avança do primeiro passo", async () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Avançar" })).toBeDisabled();
  });

  it("a grade do wizard segue o período digitado no passo de dados (DEC-151)", async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog();

    fireEvent.change(screen.getByLabelText("Início do projeto"), { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByLabelText("Término do projeto"), { target: { value: "2026-08-31" } });
    await goToCronogramaStep(user);

    // Sem linha não há grade: as colunas aparecem com a primeira atividade.
    await user.click(screen.getByRole("button", { name: "Adicionar atividade" }));
    expect(screen.getByText("mar/2026")).toBeInTheDocument();
    expect(screen.getByText("ago/2026")).toBeInTheDocument();
  });

  it("sem datas do projeto a grade abre com 12 meses a partir do mês atual", async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog();
    await goToCronogramaStep(user);
    await user.click(screen.getByRole("button", { name: "Adicionar atividade" }));

    const currentMonth = todayDateOnly().slice(0, 7);
    // DEC-151: sem datas a janela é o mês atual e mais 11. As duas pontas estão na grade, e a
    // coluna seguinte à última não existe.
    expect(screen.getByText(monthColumnLabel(currentMonth))).toBeInTheDocument();
    expect(screen.getByText(monthColumnLabel(addMonths(currentMonth, 11)))).toBeInTheDocument();
    expect(screen.queryByText(monthColumnLabel(addMonths(currentMonth, 12)))).not.toBeInTheDocument();
  });

  it("o passo de cronograma manda metas e atividades no corpo da criação", async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog();

    fireEvent.change(screen.getByLabelText("Início do projeto"), { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByLabelText("Término do projeto"), { target: { value: "2026-08-31" } });
    await goToCronogramaStep(user);

    await user.click(screen.getByRole("button", { name: "Adicionar meta" }));
    await user.type(screen.getByLabelText("Descrição da meta 1"), "Publicar artigo");

    await user.click(screen.getByRole("button", { name: "Adicionar atividade" }));
    await user.type(screen.getByLabelText("Descrição da atividade 1"), "Revisão da literatura");
    // Estende mar → mai: a linha é contínua e a recompensa acompanha (DEC-126d/103).
    await user.click(screen.getByRole("button", { name: "mai/2026 — atividade 1" }));
    expect(screen.getByText("300 pts")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(captured.payload).not.toBeNull());
    expect(captured.payload!.cronograma).toEqual({
      goals: [{ description: "Publicar artigo" }],
      activities: [
        { description: "Revisão da literatura", firstMonth: "2026-03", lastMonth: "2026-05" },
      ],
    });
  });

  it("pular o passo deixa a criação sem a chave no corpo (regra 9)", async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog();
    await goToCronogramaStep(user);

    await user.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(captured.payload).not.toBeNull());
    expect(captured.payload!.cronograma).toBeUndefined();
  });

  it("linha sem nome não entra no corpo", async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog();
    await goToCronogramaStep(user);

    await user.click(screen.getByRole("button", { name: "Adicionar atividade" }));
    await user.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(captured.payload).not.toBeNull());
    expect(captured.payload!.cronograma).toBeUndefined();
  });

  it("desmarcar a única marca é recusado com a frase do domínio", async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog();
    await goToCronogramaStep(user);

    const firstMonth = todayDateOnly().slice(0, 7);
    await user.click(screen.getByRole("button", { name: "Adicionar atividade" }));
    await user.click(
      screen.getByRole("button", { name: `${monthColumnLabel(firstMonth)} — atividade 1` }),
    );

    expect(screen.getByText(ACTIVITY_MIN_MONTH_MESSAGE)).toBeInTheDocument();
  });

  it("o responsável sugerido é quem vai participar do projeto", async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog();

    await user.type(screen.getByLabelText("Nome do Projeto"), "Projeto Equipe");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("checkbox", { name: "Bolsista Bruno" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));

    await user.click(screen.getByRole("button", { name: "Adicionar atividade" }));
    await user.click(screen.getByRole("combobox", { name: "Responsável da atividade 1" }));
    const options = await screen.findAllByRole("option");
    const names = options.map((option) => option.textContent);
    expect(names).toContain("Bolsista Bruno");
    // Quem cria também pode ser responsável: é o mesmo conjunto que o servidor aceita.
    expect(names).toContain("Coordenadora Ana");
  });

  it("editar projeto continua uma página só, sem passo e sem cronograma", async () => {
    renderDialog({
      id: 12,
      name: "Projeto existente",
      description: "",
      status: "active",
      leaderId: null,
      links: [],
      startDate: "2026-03-01",
      endDate: "2026-08-31",
    } as never);

    expect(screen.queryByText(/Passo \d de 3/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Avançar" })).not.toBeInTheDocument();
    // Os campos de dados e de equipe estão juntos, como eram antes do DEC-100.
    expect(screen.getByLabelText("Nome do Projeto")).toHaveValue("Projeto existente");
    expect(screen.getByText("Líder do Projeto")).toBeInTheDocument();
    expect(screen.queryByText("Cronograma")).not.toBeInTheDocument();
  });
});
