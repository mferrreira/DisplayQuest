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
  mocks.approve.mockResolvedValue({ request: { id: 7, status: "approved" }, message: "ok" });
  mocks.reject.mockResolvedValue({ request: { id: 7, status: "rejected" }, message: "ok" });
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

  it("aprovar chama a rota, avisa e remove a linha da lista pending", async () => {
    const user = userEvent.setup({ delay: null });
    render(<PasswordResetRequests />);
    await user.click(
      await screen.findByRole("button", { name: "Aprovar troca de senha de maria@lab.com" }),
    );
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith(7));
    await screen.findByText("Nenhuma solicitação pendente");
    expect(mocks.toast).toHaveBeenCalled();
  });

  it("rejeitar chama a rota e remove a linha — a solicitação não some por engano", async () => {
    const user = userEvent.setup({ delay: null });
    render(<PasswordResetRequests />);
    await user.click(
      await screen.findByRole("button", { name: "Rejeitar troca de senha de maria@lab.com" }),
    );
    await waitFor(() => expect(mocks.reject).toHaveBeenCalledWith(7));
    await screen.findByText("Nenhuma solicitação pendente");
    expect(mocks.toast).toHaveBeenCalled();
  });

  it("quem não gerencia contas não vê a lista nem os botões", () => {
    mocks.roles = ["VOLUNTARIO"];
    render(<PasswordResetRequests />);
    expect(screen.getByText("Você não tem permissão para ver solicitações de troca de senha")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /troca de senha/ })).toBeNull();
    expect(mocks.getRequests).not.toHaveBeenCalled();
  });
});
