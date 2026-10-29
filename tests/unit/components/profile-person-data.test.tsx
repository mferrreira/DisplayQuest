/**
 * V5-4a (DEC-138) — a tela onde a PESSOA escreve os próprios dados: `components/forms/
 * user-profile-form.tsx`.
 *
 * O que estes testes fixam:
 *   1. O CPF não vem da sessão (DEC-138: a sessão vive em cookie) — ele é buscado na rota de
 *      perfil, que decide o direito a cada chamada, e chega à tela MASCARADO.
 *   2. O submit manda só o que mudou. Abrir o formulário e salvar não apaga o CPF de ninguém.
 *   3. O Select manda o token da lista fechada, e a sentinela "sem valor" manda null.
 *   4. O texto livre do fomento só existe com "Outra" — o formulário oficial é assim
 *      (`is_outra` + `agencia_outra`).
 *
 * Costura medida ao escrever: o formulário fala com `UserProfilesAPI` (getProfile/updateProfile)
 * e com `useSession().update`. Os dois são dobrados; o formulário, os `Select`/`Input` do Radix e
 * o `maskCpf` do domínio são os reais.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UserProfileForm } from "@/components/forms/user-profile-form";
import { UserProfileView } from "@/components/ui/user-profile-view";
import type { User } from "@/contexts/types";

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  fetchAPI: vi.fn(),
}));

vi.mock("@/contexts/api-client", () => ({
  UserProfilesAPI: {
    getProfile: mocks.getProfile,
    updateProfile: mocks.updateProfile,
  },
  // plan-v9 S04: o UserProfileView passou a montar ProfileMonthsList, que fala por fetchAPI —
  // sem o export no duplo, a leitura de meses estoura "No "fetchAPI" export" e os testes do
  // cartão de terceiro caem junto. O corpo é o da rota real para lista vazia.
  fetchAPI: mocks.fetchAPI,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: mocks.updateSession }),
}));

// Resposta padrão para a leitura de meses do perfil de terceiro (rota /api/users/:id/board-months).
beforeEach(() => {
  mocks.fetchAPI.mockResolvedValue({
    months: [],
    notice: "Nenhum mês fechado ainda. A lista aparece depois do primeiro fechamento.",
    userId: 7,
    track: "MONTH_POINTS",
  });
});

const me = (overrides: Partial<User> = {}): User => ({
  id: 7,
  name: "Ana Souza",
  email: "ana@lab.com",
  points: 10,
  completedTasks: 1,
  status: "active",
  weekHours: 10,
  currentWeekHours: 0,
  profileVisibility: "public",
  bio: null,
  avatar: null,
  roles: ["VOLUNTARIO"],
  createdAt: new Date("2026-10-01T12:00:00.000Z"),
  ...overrides,
});

function renderForm(user: User) {
  render(<UserProfileForm user={user} onUpdate={vi.fn()} onCancel={vi.fn()} />);
  return user;
}

beforeEach(() => {
  mocks.updateSession.mockReset();
  mocks.getProfile.mockReset();
  mocks.updateProfile.mockReset();
  mocks.getProfile.mockResolvedValue({ user: { cpf: "52998224725" } });
  mocks.updateProfile.mockResolvedValue({ user: {} });
});

describe("o CPF chega pela rota de perfil, não pela sessão", () => {
  it("o campo nasce vazio e é preenchido pela leitura, já mascarado", async () => {
    const user = renderForm(me()); // a sessão não carrega cpf

    expect((screen.getByLabelText("CPF") as HTMLInputElement).value).toBe("");

    await waitFor(() =>
      expect((screen.getByLabelText("CPF") as HTMLInputElement).value).toBe("529.982.247-25"),
    );
    expect(mocks.getProfile).toHaveBeenCalledWith(7);
    expect(user.id).toBe(7);
  });

  it("a tela diz quem lê o CPF", () => {
    renderForm(me());
    expect(screen.getByText("Só você e quem gerencia contas leem o CPF.")).toBeInTheDocument();
  });

  it("sem leitura disponível o campo fica em branco, e nada é inventado", async () => {
    mocks.getProfile.mockRejectedValue(new Error("sem leitura"));

    renderForm(me());

    await waitFor(() => expect(mocks.getProfile).toHaveBeenCalled());
    expect((screen.getByLabelText("CPF") as HTMLInputElement).value).toBe("");
  });
});

describe("o submit manda só o que mudou", () => {
  it("abrir e salvar sem mexer não envia nenhum dado de pessoa", async () => {
    const user = renderForm(
      me({ course: "Sistemas de Informação", scholarshipType: "PIBIC_JR", level: "GRADUACAO" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    const body = mocks.updateProfile.mock.calls[0][1];

    expect(mocks.updateProfile.mock.calls[0][0]).toBe(user.id);
    for (const field of ["cpf", "course", "scholarshipType", "level", "registrationNumber", "fundingAgency"]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("escrever o curso envia o curso, e nenhum outro dado de pessoa vai junto", async () => {
    renderForm(me());

    await userEvent.type(screen.getByLabelText("Curso"), "Engenharia de Software");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    const body = mocks.updateProfile.mock.calls[0][1];

    expect(body.course).toBe("Engenharia de Software");
    for (const field of ["cpf", "scholarshipType", "level", "registrationNumber", "fundingAgency"]) {
      expect(body).not.toHaveProperty(field);
    }
    // `bio: ""` também sai: quirk pré-existente deste formulário (bio nulo vira "" no estado e o
    // diff manda), e o servidor o reconcilia para null. Não é deste batch e não foi mudado.
  });

  it("o Select manda o token da lista fechada, não o rótulo", async () => {
    renderForm(me());

    await userEvent.click(screen.getByRole("combobox", { name: "Modalidade de IC" }));
    await userEvent.click(await screen.findByRole("option", { name: "PIBIC Jr" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    expect(mocks.updateProfile.mock.calls[0][1]).toMatchObject({ scholarshipType: "PIBIC_JR" });
  });

  it("\"Sem nível\" envia null: limpar é uma ação possível", async () => {
    renderForm(me({ level: "GRADUACAO" }));

    await userEvent.click(screen.getByRole("combobox", { name: "Nível" }));
    await userEvent.click(await screen.findByRole("option", { name: "Sem nível" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    expect(mocks.updateProfile.mock.calls[0][1]).toMatchObject({ level: null });
  });
});

describe("o texto livre do fomento segue o formulário oficial", () => {
  it("sem agência escolhida, não há campo de nome", () => {
    renderForm(me());
    expect(screen.queryByLabelText("Nome da instituição")).not.toBeInTheDocument();
  });

  it("escolher \"Outra\" abre o campo, e o nome enviado vai junto", async () => {
    renderForm(me());

    await userEvent.click(screen.getByRole("combobox", { name: "Instituição de fomento" }));
    await userEvent.click(await screen.findByRole("option", { name: "Outra" }));

    const other = await screen.findByLabelText("Nome da instituição");
    await userEvent.type(other, "FAPEMIG");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    expect(mocks.updateProfile.mock.calls[0][1]).toMatchObject({
      fundingAgency: "OUTRA",
      fundingAgencyOther: "FAPEMIG",
    });
  });
});

describe("o cartão de leitura do perfil (perfil de outra pessoa)", () => {
  it("mostra os campos abertos com o rótulo do domínio, e nunca o CPF", () => {
    render(
      <UserProfileView
        user={me({
          course: "Sistemas de Informação",
          registrationNumber: "2026110001",
          scholarshipType: "PIBIC_JR",
          level: "POS_GRADUACAO",
          fundingAgency: "OUTRA",
          fundingAgencyOther: "FAPEMIG",
          cpf: "52998224725", // presente no objeto, e ainda assim não pode aparecer
        })}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("Dados para os documentos")).toBeInTheDocument();
    expect(screen.getByText("Sistemas de Informação")).toBeInTheDocument();
    expect(screen.getByText("2026110001")).toBeInTheDocument();
    expect(screen.getByText("PIBIC Jr")).toBeInTheDocument();
    expect(screen.getByText("Pós-graduação")).toBeInTheDocument();
    // Com "Outra", o que o documento imprime é o nome escrito, não a palavra "Outra".
    expect(screen.getByText("FAPEMIG")).toBeInTheDocument();

    expect(screen.queryByText(/529/)).not.toBeInTheDocument();
    expect(screen.queryByText("529.982.247-25")).not.toBeInTheDocument();
  });

  it("sem dado de pessoa, o bloco não aparece", () => {
    render(<UserProfileView user={me()} onBack={vi.fn()} />);

    expect(screen.queryByText("Dados para os documentos")).not.toBeInTheDocument();
  });
});
