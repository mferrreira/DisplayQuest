/**
 * plan-v24 S02 — o card "Solicitações de troca de senha" resolve solicitações.
 *
 * O card vive na aba de usuários do painel. Os botões Aprovar/Rejeitar chamam a
 * mesma rota que os testes de rota exercitam; o card não recalcula nada (R7/R8/R9).
 * Os botões têm `aria-label` nomeando o alvo (padrão da casa para botão-ícone/ação
 * em linha — DEC-86) e a linha sai da lista depois da resolução.
 *
 * Contextos mockados: a página inteira do painel exige a stack de provedores
 * (lição medida do V4-4b); este teste monta só o card com `useAuth` e o api-client
 * mockados, porque o que se prova é o card, não a stack.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PASSWORD_RESET_APPROVE_MESSAGE, PASSWORD_RESET_REJECT_MESSAGE } from "@/backend/domain";

const mocks = vi.hoisted(() => ({
  roles: ["COORDENADOR"] as string[],
  getRequests: vi.fn<() => Promise<{ requests: Array<Record<string, unknown>> }>>(),
  approve: vi.fn<() => Promise<{ request: Record<string, unknown>; message: string }>>(),
  reject: vi.fn<() => Promise<{ request: Record<string, unknown>; message: string }>>(),
  toast: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { roles: mocks.roles } }),
}));

vi.mock("@/contexts/api-client", () => ({
  PasswordResetAPI: {
    getRequests: mocks.getRequests,
    approve: mocks.approve,
    reject: mocks.reject,
  },
}));

vi.mock("@/contexts/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

import { PasswordResetRequests } from "@/components/features/password-reset-requests";

const PENDING = [
  {
    id: 7,
    email: "maria@lab.com",
    status: "pending",
    createdAt: "2026-11-12T12:34:00.000Z",
  },
];

beforeEach(() => {
  mocks.roles = ["COORDENADOR"];
  mocks.getRequests.mockClear();
  mocks.getRequests.mockResolvedValue({ requests: PENDING });
  mocks.approve.mockResolvedValue({ request: { id: 7, status: "approved" }, message: PASSWORD_RESET_APPROVE_MESSAGE });
  mocks.reject.mockResolvedValue({ request: { id: 7, status: "rejected" }, message: PASSWORD_RESET_REJECT_MESSAGE });
  mocks.toast.mockReset();
});

describe("card de solicitações de troca de senha", () => {
  it("lista a solicitação com os botões nomeados por linha", async () => {
    render(<PasswordResetRequests />);
    expect(await screen.findByText("maria@lab.com")).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: "Aprovar troca de senha de maria@lab.com" }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: "Rejeitar troca de senha de maria@lab.com" }),
    ).toBeTruthy();
  });

  it("aprovar chama a rota, avisa com a frase da resposta e remove a linha da lista pending", async () => {
    const user = userEvent.setup({ delay: null });
    render(<PasswordResetRequests />);
    await user.click(
      await screen.findByRole("button", { name: "Aprovar troca de senha de maria@lab.com" }),
    );
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith(7));
    await screen.findByText("Nenhuma solicitação pendente");
    // DEC-93: o aviso sai da resposta da rota, não de cópia na tela.
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "Solicitação aprovada",
      description: PASSWORD_RESET_APPROVE_MESSAGE,
      variant: "default",
    });
  });

  it("rejeitar chama a rota e remove a linha — a solicitação não some por engano", async () => {
    const user = userEvent.setup({ delay: null });
    render(<PasswordResetRequests />);
    await user.click(
      await screen.findByRole("button", { name: "Rejeitar troca de senha de maria@lab.com" }),
    );
    await waitFor(() => expect(mocks.reject).toHaveBeenCalledWith(7));
    await screen.findByText("Nenhuma solicitação pendente");
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "Solicitação rejeitada",
      description: PASSWORD_RESET_REJECT_MESSAGE,
      variant: "default",
    });
  });

  it("aprovação recusada pela rota avisa em destructive e a linha permanece", async () => {
    // O aceite da rota cobre o 409/404; aqui se prova que a tela NÃO remove a linha
    // quando a resposta é recusa — só depois da resposta 200.
    mocks.approve.mockRejectedValueOnce(new Error("Solicitação já resolvida"));
    const user = userEvent.setup({ delay: null });
    render(<PasswordResetRequests />);
    await user.click(
      await screen.findByRole("button", { name: "Aprovar troca de senha de maria@lab.com" }),
    );
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    ));
    expect(screen.getByText("maria@lab.com")).toBeTruthy();
  });

  it("falha de leitura diz o aviso com role=alert, não estado vazio", async () => {
    mocks.getRequests.mockRejectedValueOnce(new Error("500"));
    render(<PasswordResetRequests />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar as solicitações");
    expect(screen.queryByText("Nenhuma solicitação pendente")).toBeNull();
  });

  it("o contador do card casa em número e plural", async () => {
    mocks.getRequests.mockResolvedValue({
      requests: [
        { ...PENDING[0], id: 7 },
        { id: 8, email: "joao@lab.com", status: "pending", createdAt: "2026-11-12T13:00:00.000Z" },
      ],
    });
    render(<PasswordResetRequests />);
    expect(await screen.findByText("2 solicitações pendentes")).toBeTruthy();
  });

  it("carregando: o card diz Carregando... antes da resposta chegar", async () => {
    let release: (value: { requests: typeof PENDING }) => void = () => {};
    mocks.getRequests.mockImplementationOnce(() => new Promise((resolve) => {
      release = resolve;
    }));
    render(<PasswordResetRequests />);
    expect(await screen.findByText("Carregando solicitações...")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /troca de senha/ })).toBeNull();
    release({ requests: PENDING });
    expect(await screen.findByText("maria@lab.com")).toBeTruthy();
  });

  it("vazio: a lista sem linhas diz Nenhuma solicitação pendente, sem botões", async () => {
    mocks.getRequests.mockResolvedValueOnce({ requests: [] });
    render(<PasswordResetRequests />);
    expect(await screen.findByText("Nenhuma solicitação pendente")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /troca de senha/ })).toBeNull();
    // O vazio não repete a frase: a descrição do header só existe com linhas.
    expect(screen.queryByText(/^1 solicitação pendente$/)).toBeNull();
  });

  it("quem não gerencia contas não vê a lista nem os botões", () => {
    mocks.roles = ["VOLUNTARIO"];
    render(<PasswordResetRequests />);
    expect(screen.getByText("Você não tem permissão para ver solicitações de troca de senha")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /troca de senha/ })).toBeNull();
    expect(mocks.getRequests).not.toHaveBeenCalled();
  });
});
