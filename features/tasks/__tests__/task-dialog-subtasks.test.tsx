/**
 * plan-v4 · V4-5c — a mãe nasce com a lista: o campo de subtasks no formulário de nova tarefa.
 *
 * Decisão do dono (DEC-82): subtask entra em tarefa delegada e privada, criada JUNTO com a mãe no
 * mesmo formulário (e também depois, no diálogo de detalhe — V4-5b). Em tarefa pública e quest
 * global o campo não existe: `supportsSubtasks` é uma função só, a mesma que o servidor usa.
 *
 * O campo aparece só na CRIAÇÃO. Editar a lista é o que o diálogo de detalhe faz (DEC-89), e
 * oferecer os dois controles para a mesma lista na mesma tela é convidar duas regras a divergir.
 *
 * O que o teste prova no fim é o estado gravado no mock: a mãe chega com a lista e com a base
 * `10 + 10·n` (DEC-83) — não "o input existia".
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { TaskDialog } from "../components/task-dialog";
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

function renderDialog(task: ReturnType<typeof makeTask> | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <SessionProvider session={null}>
      <QueryClientProvider client={queryClient}>
        <TaskDialog open onOpenChange={() => {}} task={task} />
      </QueryClientProvider>
    </SessionProvider>,
  );
}

async function createWithTitle(title: string) {
  await userEvent.type(await screen.findByRole("textbox", { name: "Título" }), title);
  await userEvent.click(screen.getByRole("button", { name: "Criar Tarefa" }));
}

describe("V4-5c · subtask no formulário de nova tarefa", () => {
  beforeEach(() => resetTaskStore());

  it("o campo existe na criação de tarefa delegada", async () => {
    renderDialog(null);
    expect(await screen.findByRole("textbox", { name: "Nova subtask" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar subtask" })).toBeInTheDocument();
  });

  it("a mãe nasce com a lista e com a base 10 + 10·n (DEC-83)", async () => {
    renderDialog(null);

    await userEvent.type(await screen.findByRole("textbox", { name: "Título" }), "Montar o espectrômetro");
    for (const title of ["Ligar a fonte", "Ajustar o zero"]) {
      await userEvent.type(screen.getByRole("textbox", { name: "Nova subtask" }), title);
      await userEvent.click(screen.getByRole("button", { name: "Adicionar subtask" }));
    }
    await userEvent.click(screen.getByRole("button", { name: "Criar Tarefa" }));

    await waitFor(() => {
      const created = getTaskStore().find((t) => t.title === "Montar o espectrômetro");
      expect(created).toBeDefined();
      expect(created!.subtasks.map((s) => s.title)).toEqual(["Ligar a fonte", "Ajustar o zero"]);
      expect(created!.points).toBe(30);
    });
  });

  it("subtask vazia não entra na lista", async () => {
    renderDialog(null);
    await userEvent.type(await screen.findByRole("textbox", { name: "Título" }), "Tarefa sem subtask");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar subtask" }));

    expect(screen.queryAllByRole("button", { name: "Remover subtask" })).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Criar Tarefa" }));

    await waitFor(() => {
      const created = getTaskStore().find((t) => t.title === "Tarefa sem subtask");
      expect(created!.subtasks).toHaveLength(0);
      expect(created!.points).toBe(10);
    });
  });

  it("tarefa pública não oferece o campo (DEC-82)", async () => {
    renderDialog(null);
    await userEvent.type(await screen.findByRole("textbox", { name: "Título" }), "Pública qualquer");
    await userEvent.click(screen.getByRole("combobox", { name: "Visibilidade da tarefa" }));
    await userEvent.click(await screen.findByRole("option", { name: /^Pública/ }));

    expect(screen.queryByRole("textbox", { name: "Nova subtask" })).not.toBeInTheDocument();
  });

  it("quest global não oferece o campo (DEC-82)", async () => {
    renderDialog(null);
    await userEvent.type(await screen.findByRole("textbox", { name: "Título" }), "Quest com subtask?");
    // Medido: "Quest Global" é um `Switch` do Radix (role="switch"), não uma checkbox.
    await userEvent.click(await screen.findByRole("switch", { name: "Quest Global" }));

    expect(screen.queryByRole("textbox", { name: "Nova subtask" })).not.toBeInTheDocument();
  });

  it("na edição o campo não aparece — a lista vive no diálogo de detalhe (DEC-89)", async () => {
    const existing = makeTask({ id: 701, title: "Tarefa existente", status: "in-progress" });
    seedTasks([existing]);
    renderDialog(existing);

    expect(await screen.findByRole("button", { name: "Salvar" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Nova subtask" })).not.toBeInTheDocument();
  });
});
