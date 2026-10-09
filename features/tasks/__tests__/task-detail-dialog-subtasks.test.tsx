/**
 * plan-v4 · V4-5b — a lista de subtasks no diálogo de detalhe.
 *
 * É aqui que a lista inteira mora (DEC-89): o cartão só avisa e conclui; criar, renomear e apagar
 * vivem neste diálogo. O que estes testes fixam:
 *
 *   1. a lista aparece com o progresso (concluídas/total);
 *   2. criar adiciona à mãe — e a base do prêmio da mãe acompanha (10 + 5·n, DEC-97);
 *   3. renomear e apagar chegam à API;
 *   4. concluir a última aberta move a mãe para Em Revisão (DEC-81) e o diálogo diz isso;
 *   5. a JANELA (DEC-80) na UI: mãe em `in-review`/`done` não oferece criar/renomear/apagar; e a
 *      TRAVA DEC-98: fora de Andamento marcar leva o toast `subtaskMarkMessage` (a mesma frase
 *      que o servidor recusa com 409) — em `done` o checkbox nem responde;
 *   6. tarefa pública e quest global não têm seção de subtask (DEC-82).
 *
 * A porta de autoridade da UI é a mesma que o servidor usa: `canManageTasks` do diálogo é a lista
 * de MANAGE_TASKS (medido: lib/auth/features → permissions.ts:22), e o servidor aceita
 * MANAGE_TASKS **ou** responsável da tarefa (task-view.ts:208-216). A UI oferece as duas.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";
import { TaskDetailDialog } from "../components/task-detail-dialog";
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

// Mesma medição do V4-5a: `<Toaster/>` do sonner chama `window.matchMedia` num effect e o jsdom
// não tem a função. Stub local — um shim global mudaria `useIsDesktop()` de todos os testes.
function installMatchMediaStub() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function renderDialog(task: ReturnType<typeof makeTask>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <SessionProvider session={null}>
      <QueryClientProvider client={queryClient}>
        <TaskDetailDialog task={task} open onOpenChange={() => {}} onEdit={() => {}} />
        <Toaster position="bottom-right" />
      </QueryClientProvider>
    </SessionProvider>,
  );
}

const openSubtask = (id: number, title: string) => ({
  id,
  taskId: 501,
  title,
  completed: false,
  completedAt: null,
});
const closedSubtask = (id: number, title: string) => ({
  ...openSubtask(id, title),
  completed: true,
  completedAt: "2026-10-01T12:00:00.000Z",
});

function mother(overrides: Partial<ReturnType<typeof makeTask>> = {}) {
  return makeTask({
    id: 501,
    title: "Calibrar o espectrômetro",
    status: "in-progress",
    assignedTo: 3,
    // Base gravada da mãe (DEC-97): 10 + 5·3 subtasks = 25.
    points: 25,
    subtasks: [
      closedSubtask(901, "Ligar a fonte"),
      openSubtask(902, "Ajustar o zero"),
      openSubtask(903, "Medir o ruído"),
    ],
    ...overrides,
  });
}

describe("V4-5b · a lista de subtasks no diálogo", () => {
  beforeEach(() => {
    resetTaskStore();
    installMatchMediaStub();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).matchMedia;
  });

  it("lista as subtasks com o progresso", async () => {
    const task = mother();
    seedTasks([task]);
    renderDialog(task);

    expect(await screen.findByText("Subtasks")).toBeInTheDocument();
    expect(screen.getByText("Ajustar o zero")).toBeInTheDocument();
    expect(screen.getByText("Medir o ruído")).toBeInTheDocument();
    expect(screen.getByText("Ligar a fonte")).toBeInTheDocument();
    expect(screen.getByText(/1\/3 concluídas/)).toBeInTheDocument();
  });

  it("criar subtask chega à API e a base da mãe acompanha (10 + 5·n, DEC-97)", async () => {
    const task = mother();
    seedTasks([task]);
    renderDialog(task);

    await userEvent.type(await screen.findByRole("textbox", { name: "Nova subtask" }), "Trocar a lâmpada");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar subtask" }));

    await waitFor(() => {
      const stored = getTaskStore().find((t) => t.id === 501)!;
      expect(stored.subtasks.map((s) => s.title)).toContain("Trocar a lâmpada");
      expect(stored.subtasks).toHaveLength(4);
      expect(stored.points).toBe(30);
    });
  });

  it("renomear subtask chega à API", async () => {
    const task = mother();
    seedTasks([task]);
    renderDialog(task);

    await userEvent.click(await screen.findByRole("button", { name: "Renomear subtask Ajustar o zero" }));
    const input = await screen.findByRole("textbox", { name: "Novo título da subtask" });
    await userEvent.clear(input);
    await userEvent.type(input, "Zerar o detector");
    await userEvent.click(screen.getByRole("button", { name: "Salvar título da subtask" }));

    await waitFor(() => {
      const stored = getTaskStore().find((t) => t.id === 501)!;
      expect(stored.subtasks.find((s) => s.id === 902)?.title).toBe("Zerar o detector");
    });
  });

  it("apagar subtask chega à API e sai da lista", async () => {
    const task = mother();
    seedTasks([task]);
    renderDialog(task);

    await userEvent.click(await screen.findByRole("button", { name: "Apagar subtask Medir o ruído" }));
    await userEvent.click(await screen.findByRole("button", { name: "Apagar subtask" }));

    await waitFor(() => {
      const stored = getTaskStore().find((t) => t.id === 501)!;
      expect(stored.subtasks.map((s) => s.id)).not.toContain(903);
      expect(stored.subtasks).toHaveLength(2);
      expect(stored.points).toBe(20);
    });
  });

  it("concluir a ÚLTIMA aberta move a mãe para Em Revisão e o diálogo explica (DEC-81)", async () => {
    const task = mother({
      points: 20,
      subtasks: [closedSubtask(901, "Ligar a fonte"), openSubtask(902, "Ajustar o zero")],
    });
    seedTasks([task]);
    renderDialog(task);

    await userEvent.click(await screen.findByRole("checkbox", { name: "Concluir subtask Ajustar o zero" }));

    expect(await screen.findByText(/Última subtask concluída/)).toBeInTheDocument();
    await waitFor(() => expect(getTaskStore().find((t) => t.id === 501)?.status).toBe("in-review"));
  });

  it("janela (DEC-80) + trava (DEC-98): em revisão a lista fecha e marcar avisa", async () => {
    const task = mother({ status: "in-review" });
    seedTasks([task]);
    renderDialog(task);

    expect(await screen.findByText("Subtasks")).toBeInTheDocument();
    // A frase é a do servidor, não uma paráfrase da UI.
    expect(screen.getByText(/a lista de subtasks não muda mais/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Nova subtask" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar subtask" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Renomear subtask Ajustar o zero" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apagar subtask Medir o ruído" })).not.toBeInTheDocument();

    // Marcar fora de Andamento não passa (DEC-98): o checkbox responde com o toast, cuja
    // descrição é EXATAMENTE a frase que o servidor devolve em 409 — e nada é gravado.
    await userEvent.click(screen.getByRole("checkbox", { name: "Concluir subtask Ajustar o zero" }));
    expect(await screen.findByText("Ação não permitida")).toBeInTheDocument();
    expect(
      await screen.findByText("A tarefa precisa estar em Andamento para marcar subtasks."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(getTaskStore().find((t) => t.id === 501)?.subtasks.find((s) => s.id === 902)?.completed).toBe(
        false,
      ),
    );
  });

  it("mãe concluída fecha também a conclusão", async () => {
    const task = mother({ status: "done", completed: true, completedAt: "2026-10-02T12:00:00.000Z" });
    seedTasks([task]);
    renderDialog(task);

    expect(await screen.findByText("Subtasks")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: "Concluir subtask Ajustar o zero" });
    expect(checkbox).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: "Nova subtask" })).not.toBeInTheDocument();
  });

  it("tarefa pública e quest global não têm seção de subtask (DEC-82)", async () => {
    const publicTask = mother({ taskVisibility: "public", subtasks: [] });
    renderDialog(publicTask);
    expect(await screen.findByText("Calibrar o espectrômetro")).toBeInTheDocument();
    expect(screen.queryByText("Subtasks")).not.toBeInTheDocument();

    // O diálogo é uma instância por tarefa: re-renderiza com a quest global.
    const { unmount } = renderDialog(
      mother({ isGlobal: true, taskVisibility: "public", title: "Quest global", subtasks: [] }),
    );
    unmount();
    expect(screen.queryByText("Subtasks")).not.toBeInTheDocument();
  });
});
