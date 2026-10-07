/**
 * plan-v4 · V4-5a — a subtask no cartão do quadro.
 *
 * O que o dono decidiu (2026-10-06), e é isto que estes testes fixam:
 *   - o cartão **não** mostra a lista de subtasks: mostra o **aviso de trava** com a contagem, e
 *     as subtasks **abertas** como checkbox (concluir é o que destrava); a lista completa — com
 *     criar/renomear/apagar — vive no diálogo de detalhe (V4-5b);
 *   - concluir tem **checkbox direta no cartão**: um clique, sem abrir diálogo;
 *   - a UI **desabilita** o movimento, além de bloqueá-lo: o menu "Ações para …" deixa de
 *     oferecer Em Revisão/Concluído, e o botão Aprovar fica desabilitado;
 *   - o auto-move da mãe (DEC-81) é **explicado**: além de o cartão mudar de coluna, a interface
 *     diz que foi a última subtask, não a pessoa.
 *
 * Como o servidor já recusa (V4-4), estes testes não provam a regra — provam que o cartão chega
 * na mesma decisão. A rede é o mock de `tests/mocks/handlers.ts`, que agora espelha a trava, a
 * janela e o auto-move usando as MESMAS funções do domínio que a rota real usa.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { Toaster } from "@/components/ui/sonner";
import { TaskBoard } from "../components/task-board";
import { getTaskStore, resetTaskStore, seedTasks } from "@/tests/mocks/handlers";
import { makeTask } from "@/tests/mocks/fixtures/tasks";

const mockUser = { id: 2, name: "Coordenador", email: "coordenador@lab.com", roles: ["COORDENADOR"] };

vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...actual,
    useSession: () => ({ data: { user: mockUser, expires: "" }, status: "authenticated" }),
  };
});

function renderBoard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <SessionProvider session={null}>
      <QueryClientProvider client={queryClient}>
        <NuqsTestingAdapter searchParams="">
          <TaskBoard />
          {/* Sem <Toaster/> montado, `toast.*` do sonner não chega ao DOM — e o aviso do
              auto-move é justamente o que este lote promete. */}
          <Toaster position="bottom-right" />
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </SessionProvider>,
  );
}

/**
 * Medido ao escrever este lote: o `<Toaster/>` do sonner **não monta no jsdom** — ele chama
 * `window.matchMedia("(prefers-color-scheme: dark)")` num effect e o jsdom não tem a função
 * (mesma classe do `useIsDesktop()` do quadro, já registrada no AGENTS.md). O stub é LOCAL a
 * este arquivo de propósito: um shim global em `tests/setup.ts` faria `useIsDesktop()` responder
 * em todos os testes da base, e hoje eles caem no caminho "mobile" justamente porque não há
 * matchMedia.
 */
function installMatchMediaStub() {
  const matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia });
}

/**
 * Medido nesta base (2026-10-02, AGENTS.md): o jsdom do Vitest não tem `window.localStorage`.
 * O quadro guarda ordenação de coluna e baseline de pontos ali; sem o stub, o teste mede o
 * caminho de SSR.
 */
function installMemoryStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
      clear: () => data.clear(),
      key: () => null,
      get length() {
        return data.size;
      },
    },
  });
}

const openSubtask = (id: number, title: string) => ({
  id,
  taskId: 401,
  title,
  completed: false,
  completedAt: null,
});
const closedSubtask = (id: number, title: string) => ({
  ...openSubtask(id, title),
  completed: true,
  completedAt: "2026-10-01T12:00:00.000Z",
});

/** Mãe em `in-progress` com duas abertas e uma concluída — o estado mais comum do fluxo. */
function seedMotherWithOpenSubtasks() {
  seedTasks([
    makeTask({
      id: 401,
      title: "Montar a bancada",
      status: "in-progress",
      assignedTo: 3,
      points: 40,
      subtasks: [
        closedSubtask(901, "Comprar os parafusos"),
        openSubtask(902, "Furar a madeira"),
        openSubtask(903, "Nivelar o tampo"),
      ],
    }),
  ]);
}

function cardInColumn(columnTitle: string, title: string): boolean {
  return within(screen.getByLabelText(`Coluna ${columnTitle}`))
    .queryAllByRole("button", { name: `Ações para ${title}` })
    .some(() => true);
}

describe("V4-5a · o cartão avisa da trava e deixa concluir a subtask", () => {
  beforeEach(() => {
    resetTaskStore();
    installMemoryStorage();
    installMatchMediaStub();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).localStorage;
    delete (window as unknown as Record<string, unknown>).matchMedia;
  });

  it("mostra o aviso de trava com a contagem das abertas", async () => {
    seedMotherWithOpenSubtasks();
    renderBoard();

    expect(await screen.findByText(/2 subtasks abertas/)).toBeInTheDocument();
  });

  it("cada subtask ABERTA tem uma checkbox nomeada; a concluída não aparece no cartão", async () => {
    seedMotherWithOpenSubtasks();
    renderBoard();

    expect(await screen.findByRole("checkbox", { name: "Concluir subtask Furar a madeira" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Concluir subtask Nivelar o tampo" })).toBeInTheDocument();
    // A concluída já foi: o cartão não vira lista de histórico (decisão do dono — a lista
    // completa, com criar/renomear/apagar, fica no diálogo de detalhe).
    expect(
      screen.queryByRole("checkbox", { name: "Concluir subtask Comprar os parafusos" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Comprar os parafusos")).not.toBeInTheDocument();
  });

  it("concluir pela checkbox chama a API e a mãe continua na mesma coluna", async () => {
    seedMotherWithOpenSubtasks();
    renderBoard();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Concluir subtask Furar a madeira" }),
    );

    await waitFor(() => {
      const mother = getTaskStore().find((t) => t.id === 401)!;
      expect(mother.subtasks.find((s) => s.id === 902)?.completed).toBe(true);
    });
    // Uma aberta ainda trava: a mãe não se moveu sozinha.
    expect(cardInColumn("Em Andamento", "Montar a bancada")).toBe(true);
    expect(cardInColumn("Em Revisão", "Montar a bancada")).toBe(false);
  });

  it("concluir a ÚLTIMA aberta move a mãe para Em Revisão e o cartão diz que foi a subtask (DEC-81)", async () => {
    seedTasks([
      makeTask({
        id: 401,
        title: "Montar a bancada",
        status: "in-progress",
        assignedTo: 3,
        points: 30,
        subtasks: [closedSubtask(901, "Comprar os parafusos"), openSubtask(902, "Furar a madeira")],
      }),
    ]);
    renderBoard();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Concluir subtask Furar a madeira" }),
    );

    // O cartão mudou de coluna sem a pessoa arrastar.
    await waitFor(() => expect(cardInColumn("Em Revisão", "Montar a bancada")).toBe(true));
    expect(cardInColumn("Em Andamento", "Montar a bancada")).toBe(false);

    // E a interface explica o movimento, em vez de deixar a tarefa sumir sozinha de uma coluna.
    expect(await screen.findByText(/Última subtask concluída/)).toBeInTheDocument();
  });

  it("o badge de pontos mostra a BASE gravada: 10 + 5·concluídas (DEC-97)", async () => {
    seedMotherWithOpenSubtasks(); // 3 subtasks, 1 concluída → 10 + 5 = 15
    renderBoard();

    expect(await screen.findAllByText("15 pts")).not.toHaveLength(0);
  });

  it("marcar fora de Em Andamento avisa e não grava — a frase é a do servidor (DEC-98)", async () => {
    // Mãe em revisão com subtask aberta só nasce de dado legado (com a trava, o auto-move
    // DEC-81 não deixa esse estado se formar) — mas o dado existe e o clique tem de avisar.
    seedTasks([
      makeTask({
        id: 403,
        title: "Revisar o alinhamento",
        status: "in-review",
        assignedTo: 3,
        points: 15,
        subtasks: [openSubtask(911, "Conferir o ruído")],
      }),
    ]);
    renderBoard();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Concluir subtask Conferir o ruído" }),
    );

    expect(await screen.findByText("Ação não permitida")).toBeInTheDocument();
    expect(
      await screen.findByText("A tarefa precisa estar em Andamento para marcar subtasks."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(getTaskStore().find((t) => t.id === 403)?.subtasks[0]?.completed).toBe(false),
    );
  });

  it("desmarcar no detalhe atualiza o cartão e o diálogo sem refresh (item 1 do ajuste pós-encerramento)", async () => {
    // O caminho que o ajuste consertou: mutação → cache de LISTAS → o quadro rederiva a tarefa
    // por id → o diálogo recebe a mãe nova. Antes o diálogo ficava com o snapshot da abertura.
    seedTasks([
      makeTask({
        id: 404,
        title: "Medir o alinhamento",
        status: "in-progress",
        assignedTo: 3,
        points: 25,
        subtasks: [
          closedSubtask(920, "Ligar a fonte"),
          closedSubtask(921, "Ajustar o zero"),
          openSubtask(922, "Medir o ruído"),
        ],
      }),
    ]);
    renderBoard();

    // Selo da mãe: 10 + 5·2 concluídas = 20 (DEC-97).
    expect(await screen.findAllByText("20 pts")).not.toHaveLength(0);

    await userEvent.click(await screen.findByRole("button", { name: "Ações para Medir o alinhamento" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /ver detalhes/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/2\/3 concluídas/)).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "Concluir subtask Ligar a fonte" }),
    );

    // O mock gravou a desmarcação...
    await waitFor(() => {
      const mother = getTaskStore().find((t) => t.id === 404)!;
      expect(mother.subtasks.find((s) => s.id === 920)?.completed).toBe(false);
    });
    // ...e a MÃE rederivou do cache: o diálogo diz 1/3 e o selo do cartão cai para 15 pts,
    // tudo na mesma montagem — sem recarregar a página nem reabrir o diálogo.
    expect(await within(screen.getByRole("dialog")).findByText(/1\/3 concluídas/)).toBeInTheDocument();
    expect(await screen.findAllByText("15 pts")).not.toHaveLength(0);
  });

  it("o menu de ações deixa de oferecer Em Revisão e Concluído enquanto há subtask aberta", async () => {
    seedMotherWithOpenSubtasks();
    renderBoard();

    await userEvent.click(await screen.findByRole("button", { name: "Ações para Montar a bancada" }));

    const items = await screen.findAllByRole("menuitem");
    const offered = items.map((i) => i.textContent?.trim());
    expect(offered).toContain("A Fazer");
    expect(offered).toContain("Ajustes");
    expect(offered).not.toContain("Em Revisão");
    expect(offered).not.toContain("Concluído");
  });

  it("o botão Aprovar fica desabilitado enquanto houver subtask aberta (DEC-80)", async () => {
    seedTasks([
      makeTask({
        id: 402,
        title: "Relatório de bancada",
        status: "in-review",
        assignedTo: 3,
        points: 20,
        subtasks: [openSubtask(910, "Revisar os dados")],
      }),
    ]);
    renderBoard();

    const approve = await screen.findByRole("button", { name: "Aprovar tarefa" });
    expect(approve).toBeDisabled();
    // A trava é sobre o destino, não sobre quem aprova: o Coordenador tem MANAGE_TASKS e mesmo
    // assim não aprova com subtask aberta.
    expect(await screen.findByText(/1 subtask aberta/)).toBeInTheDocument();
  });
});
