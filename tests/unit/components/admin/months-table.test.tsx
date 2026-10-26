import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MonthsTable, type MonthsTableRowUser } from "@/components/admin/months-table";

/**
 * S05 (MODELO §7; ADR-006/DEC-228) — a aba Meses do painel administrativo.
 *
 * O que estes testes fixam na TABELA:
 *   1. O mês em curso é a visão padrão, montada client-side sobre a MESMA lista do quadro vivo,
 *      na MESMA régua (compareByBoardPosition — ADR-005): valor desc, nome, id.
 *   2. O seletor só oferece mês corrente + meses que o SERVIDOR declara fechados;/mês nunca é
 *      deduzido no cliente (a resposta vazia pareceria bug).
 *   3. Mês fechado é leitura congelada (CA4): as linhas vêm de /api/board?month=, incluem
 *      position, e o aviso vem do servidor (a tela imprime, não redige).
 *   4. O ajuste do placar (DEC-228) fala PATCH /api/users/:id/month-points com {action, points}
 *      e refletia o resultado na linha — de/para como veio da resposta, sem recalcular (R7).
 *   5. Depois de falha o aviso role="alert" mostra a frase do servidor (DEC-85: a promessa
 *      rejeitada não escap do onClick).
 *
 * fetchAPI é dobrado (o contexto resolve `fetch` de verdade); os Seletores do Radix usam os
 * shims de tests/setup.ts e a opção é escolhida com fireEvent.click (a lista fica com
 * pointer-events:none durante a animação — lição do painel do V6-11i).
 */

const mocks = vi.hoisted(() => ({
  fetchAPI: vi.fn(),
}));

vi.mock("@/contexts/api-client", () => ({
  fetchAPI: mocks.fetchAPI,
}));

const USERS: MonthsTableRowUser[] = [
  // A ordem de chegada NÃO é a régua: Líder (70, id 1) tem de sair primeiro com valor 70, e
  // "Coordenador"(40) vem depois. Zero e empates são fixtures do fechamento (rowsFor).
  { id: 2, name: "Coordenador", currentMonthPoints: 40 },
  { id: 3, name: "Demo Segunda", currentMonthPoints: 25 },
  { id: 1, name: "Líder", currentMonthPoints: 70 },
  { id: 4, name: "Demo Zero", currentMonthPoints: 0 },
];

const CATALOG = {
  month: "2026-10",
  monthLabel: "outubro de 2026",
  track: "MONTH_POINTS",
  closed: false,
  closedMonths: [
    { month: "2027-06", monthLabel: "junho de 2027" },
    { month: "2027-11", monthLabel: "novembro de 2027" },
  ],
};

const CLOSED_JUNE = {
  month: "2027-06",
  monthLabel: "junho de 2027",
  track: "MONTH_POINTS",
  closed: true,
  live: false,
  closedAt: "2027-07-01T03:00:00.000Z",
  entries: [
    { userId: 1, name: "Coordenador", value: 240, position: 1 },
    { userId: 2, name: "Gerente", value: 120, position: 2 },
  ],
  notice: "VALOR_CONGELADO_DO_SERVIDOR",
};

/** Teste do mês à régua do quadro, pela ORDEM em que os nomes aparecem nas linhas. */
function rowOrder(): string[] {
  const table = screen.getByRole("table", { name: "Placar por pessoa no mês" });
  return within(table)
    .getAllByRole("row")
    .map((row) => row.textContent ?? "")
    .map((text) =>
      ["Líder", "Coordenador", "Demo Segunda", "Demo Zero", "Gerente"].find((name) => text.includes(name)),
    )
    .filter((name): name is string => Boolean(name));
}

function renderTable(overrides: Partial<Parameters<typeof MonthsTable>[0]> = {}) {
  return render(
    <MonthsTable
      rows={USERS}
      canAdjust={true}
      refreshKey={0}
      {...overrides}
    />,
  );
}

/** Escolhe uma opção no seletor de mês. O commit é `fireEvent.click` (a lista nasce com
 *  pointer-events:none na animação — lição do painel), e o FECHAMENTO da listbox é
 *  assíncrono: enquanto ela está aberta, o Radix esconde o resto da página (aria-hidden) e
 *  qualquer getByRole no trigger/fora dela quebra — então a função esperar o fechamento antes
 *  de devolver. `expectFetch=true` prova o DISPARO do fetch (a RESPOSTA continua assíncrona;
 *  os testes que leem linhas/aviso esperam por eles com findBy*). Voltar ao mês corrente não
 *  faz fetch nenhum (a visão viva é da lista), daí `expectFetch=false`. */
async function pickMonth(optionName: string | RegExp, expectFetch: boolean) {
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole("combobox", { name: "Escolher mês" }));
  const option = await screen.findByRole("option", { name: optionName }, { timeout: 3000 });
  fireEvent.click(option);
  await waitFor(() => {
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  }, { timeout: 3000 });
  if (expectFetch) {
    await waitFor(() => {
      expect(mocks.fetchAPI).toHaveBeenCalled();
    });
  }
}

beforeEach(() => {
  mocks.fetchAPI.mockReset();
  mocks.fetchAPI.mockImplementation(async (url: string) => {
    if (url === "/api/board") return structuredClone(CATALOG);
    if (url === "/api/board?month=2027-06") return structuredClone(CLOSED_JUNE);
    throw new Error(`URL inesperada neste teste: ${url}`);
  });
});

describe("MonthsTable — aba Meses do painel (S05)", () => {
  it("o mês em curso é a visão padrão na régua do quadro vivo (valor desc, nome, id), sem busca de histórico", async () => {
    renderTable();

    await waitFor(() => {
      expect(screen.getByText("Mês de outubro de 2026")).toBeInTheDocument();
    });
    // O quadro vivo não chama histórico: uma única leitura, sem ?month.
    const boardCalls = mocks.fetchAPI.mock.calls.filter((call) => String(call[0]) === "/api/board");
    expect(boardCalls).toHaveLength(1);

    expect(rowOrder()).toEqual(["Líder", "Coordenador", "Demo Segunda", "Demo Zero"]);
    // Colunas por linha: valor e posição da régua (1º para o líder).
    expect(screen.getByRole("cell", { name: "70" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1º" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "40" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "2º" })).toBeInTheDocument();
    // Status do mês vivo é frase própria, não o aviso de fechamento.
    expect(screen.getByText(/O quadro ainda está aberto/)).toBeInTheDocument();
  });

  it("abrir um mês fechado lê as linhas congeladas do servidor, com a posição gravada e o aviso do servidor", async () => {
    renderTable();

    await screen.findByText("Mês de outubro de 2026");
    await pickMonth("junho de 2027", true);

    // O rótulo do mês visto sai do CATÁLOGO (imediatamente); o aviso e as linhas vêm da
    // RESPOSTA do histórico — findBy* espera a resposta aterrisar, não o disparo.
    await waitFor(() => {
      expect(screen.getByText("Mês de junho de 2027")).toBeInTheDocument();
    });
    expect(mocks.fetchAPI).toHaveBeenCalledWith("/api/board?month=2027-06");
    // Aviso da leitura vem do SERVIDOR (a tela não redige texto de estado — R9/CA4).
    await screen.findByText("VALOR_CONGELADO_DO_SERVIDOR");
    expect(screen.getByText("VALOR_CONGELADO_DO_SERVIDOR")).toBeInTheDocument();

    // Linhas congeladas na posição GRAVADA, e o mês vivo saiu da tela: Gerente de jun/2027 é
    // 2º, e o placar vivo da Demo Segunda (25, mês corrente) não aparece.
    expect(rowOrder()).toEqual(["Coordenador", "Gerente"]);
    expect(screen.getByRole("cell", { name: "240" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "2º" })).toBeInTheDocument();
    expect(screen.queryByText("Demo Segunda")).not.toBeInTheDocument();
  });

  it("voltar ao mês corrente no seletor devolve a visão viva, sem nova leitura de histórico", async () => {
    renderTable();
    await screen.findByText("Mês de outubro de 2026");
    await pickMonth("junho de 2027", true);
    await screen.findByText("Mês de junho de 2027");

    mocks.fetchAPI.mockClear();
    await pickMonth(/outubro de 2026/, false);

    await waitFor(() => {
      expect(screen.getByText(/O quadro ainda está aberto/)).toBeInTheDocument();
    });
    const historyCalls = mocks.fetchAPI.mock.calls.filter((call) => String(call[0]).includes("?month="));
    expect(historyCalls).toHaveLength(0);
    expect(rowOrder()).toEqual(["Líder", "Coordenador", "Demo Segunda", "Demo Zero"]);
  });

  it("o ajuste do placar fala PATCH /api/users/:id/month-points e a linha reflete o de/para da resposta", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.fetchAPI.mockImplementation(async (url: string, options: RequestInit = {}) => {
      if (url === "/api/board") return structuredClone(CATALOG);
      if (typeof url === "string" && url === "/api/users/1/month-points") {
        expect(options.method).toBe("PATCH");
        expect(JSON.parse(String(options.body))).toEqual({ action: "set", points: -15 });
        return { userId: 1, month: "2026-10", monthLabel: "outubro de 2026", previous: 70, current: -15 };
      }
      throw new Error(`URL inesperada neste teste: ${url}`);
    });

    renderTable();
    await screen.findByText("Mês de outubro de 2026");

    // Destinatário padrão é a primeira pessoa da régua (Líder, id 1) e a ação padrão é set.
    await user.clear(screen.getByRole("spinbutton", { name: "Valor do ajuste" }));
    await user.type(screen.getByRole("spinbutton", { name: "Valor do ajuste" }), "-15");
    // set escreve valor ABSOLUTO (espelho do DEC-60): -15 é permitido em set.

    await user.click(screen.getByRole("button", { name: "Ajustar" }));

    // A resposta é a única fonte do de/para (R7): a tela anuncia o que o servidor disse.
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/de 70 para -15/);
    });
    // A linha viva reflete o novo valor.
    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "-15" })).toBeInTheDocument();
    });
  });

  it("a recusa do servidor aparece em role=alert, e nada muda na linha", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.fetchAPI.mockImplementation(async (url: string) => {
      if (url === "/api/board") return structuredClone(CATALOG);
      if (url === "/api/users/1/month-points") {
        throw new Error("Placar do mês insuficiente para remover esse valor");
      }
      throw new Error(`URL inesperada neste teste: ${url}`);
    });

    renderTable();
    await screen.findByText("Mês de outubro de 2026");

    await user.click(screen.getByRole("button", { name: "Ajustar" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Placar do mês insuficiente");
    // A linha continua como estava: nenhum override de resposta.
    expect(screen.getByRole("cell", { name: "70" })).toBeInTheDocument();
  });

  it("sem autoridade (canAdjust=false) o ajuste não existe, e a tabela continua", async () => {
    renderTable({ canAdjust: false });

    await screen.findByText("Mês de outubro de 2026");
    expect(screen.queryByRole("button", { name: "Ajustar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Valor do ajuste" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Placar por pessoa no mês" })).toBeInTheDocument();
  });

  it("a queda da leitura do catálogo não some: frase de falha em alert", async () => {
    mocks.fetchAPI.mockImplementation(async (url: string) => {
      if (url === "/api/board") return Promise.reject(new Error("boom"));
      throw new Error(`URL inesperada neste teste: ${url}`);
    });

    renderTable();
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível ler os meses/);
  });
});
