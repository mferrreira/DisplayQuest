import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MonthsCloseTrigger } from "@/components/admin/months-close-trigger";

/**
 * S05 (MODELO §7; CA9) — o botão "Fechar mês" do painel.
 *
 * O que estes testes fixam:
 *   1. Sem autoridade o botão NÃO existe (MODELO: "o botão Fechar mês para a gestão").
 *   2. Um clique fala POST /api/board/close — a rota que a S02 entregou; o gate MANAGE_USERS
 *      mora no use case (CloseBoardMonthUseCase), o gatilho é só o disparo do administrador.
 *   3. A frase de resultado vem do RESULTADO, não do desejo: fechado → anuncia o fechamento com
 *      a contagem do servidor; alreadyClosed → anuncia que já estava fechado (R6), e a lista
 *      de meses não precisa de nada (onClosed não é chamado — nenhum mês novo existe).
 *   4. Falha vai para role="alert" com a frase do servidor (DEC-85: rejeição não tratada
 *      derruba o gate inteiro da suíte).
 *   5. Enquanto o POST corre o botão fica desabilitado — segundo clique não dispara segundo
 *      fechamento.
 */

const mocks = vi.hoisted(() => ({
  fetchAPI: vi.fn(),
}));

vi.mock("@/contexts/api-client", () => ({
  fetchAPI: mocks.fetchAPI,
}));

const CLOSE_RESULT = {
  month: "2026-10",
  monthLabel: "outubro de 2026",
  track: "MONTH_POINTS",
  closed: true,
  alreadyClosed: false,
  peopleCount: 3,
  excluded: [],
};

function deferred() {
  let resolve!: (value: typeof CLOSE_RESULT) => void;
  const promise = new Promise<typeof CLOSE_RESULT>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.fetchAPI.mockReset();
});

afterEach(cleanup);

describe("MonthsCloseTrigger — botão Fechar mês (S05, CA9)", () => {
  it("sem autoridade o botão não existe", () => {
    const { container } = render(<MonthsCloseTrigger canManage={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("com autoridade, o clique fala POST /api/board/close e anuncia o fechamento com a contagem do servidor", async () => {
    const user = userEvent.setup({ delay: null });
    const onClosed = vi.fn();
    mocks.fetchAPI.mockResolvedValue(structuredClone(CLOSE_RESULT));

    render(<MonthsCloseTrigger canManage={true} onClosed={onClosed} />);
    await user.click(screen.getByRole("button", { name: "Fechar mês" }));

    expect(mocks.fetchAPI).toHaveBeenCalledWith("/api/board/close", { method: "POST" });
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/outubro de 2026/);
    });
    expect(screen.getByRole("status")).toHaveTextContent("3 pessoas");
    // Nenhum mês novo entra no catálogo por si: quem faz o refresh é o dono da lista — via
    // callback, uma vez só.
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("mês já fechado não anuncia fechamento novo e não pede refresh de lista", async () => {
    const user = userEvent.setup({ delay: null });
    const onClosed = vi.fn();
    mocks.fetchAPI.mockResolvedValue({
      ...CLOSE_RESULT,
      closed: false,
      alreadyClosed: true,
      peopleCount: 0,
    });

    render(<MonthsCloseTrigger canManage={true} onClosed={onClosed} />);
    await user.click(screen.getByRole("button", { name: "Fechar mês" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/já estava fechado/);
    });
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("a recusa do servidor aparece em alert e o callback não roda", async () => {
    const user = userEvent.setup({ delay: null });
    const onClosed = vi.fn();
    mocks.fetchAPI.mockRejectedValue(new Error("Apenas coordenadores e gerentes podem fechar o mês do quadro"));

    render(<MonthsCloseTrigger canManage={true} onClosed={onClosed} />);
    await user.click(screen.getByRole("button", { name: "Fechar mês" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Apenas coordenadores e gerentes/);
    });
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("enquanto o POST corre o botão fica desabilitado (nada de fechamento duplicado)", async () => {
    const user = userEvent.setup({ delay: null });
    const pending = deferred();
    mocks.fetchAPI.mockReturnValue(pending.promise as never);

    render(<MonthsCloseTrigger canManage={true} />);
    await user.click(screen.getByRole("button", { name: "Fechar mês" }));

    expect(screen.getByRole("button", { name: "Fechar mês" })).toBeDisabled();
    pending.resolve(structuredClone(CLOSE_RESULT));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Fechar mês" })).toBeEnabled();
    });
  });
});
