/**
 * V5-6 (DEC-99) — o filtro de atividade no quadro.
 *
 * O que este arquivo congela:
 *   1. O filtro de atividade SÓ existe com projeto selecionado — atividade é do projeto, e
 *      listar atividades de todos os projetos custaria uma requisição por projeto.
 *   2. Filtrar por etapa mostra as tasks DAQUELA etapa: tarefa de outra etapa e tarefa sem
 *      vínculo somem (o filtro casa a chave `activityId`, não "o que sobra").
 *   3. "Limpar filtros" derruba o filtro de atividade junto com os outros.
 *   4. Trocar de projeto descarta a atividade escolhida — ela pertencia ao projeto antigo.
 *
 * O cronograma é dobrado na seam de lib (precedente do V5-5b: sem handler MSW). As tasks vêm
 * do store MSW com `activityId` no read model, como a rota real emite.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SessionProvider } from "next-auth/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskBoard } from "../components/task-board";
import { BoardToolbar } from "../components/board-toolbar";
import type { TaskFilters } from "@/lib/api/endpoints/tasks";
import { resetTaskStore, resetUserStore, seedProjects, seedTasks } from "@/tests/mocks/handlers";

const mockUser = {
  id: 2,
  name: "Coordenador",
  email: "coordenador@lab.com",
  roles: ["COORDENADOR"],
};

const mocks = vi.hoisted(() => ({
  cronogramaCalls: [] as number[],
}));

vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...actual,
    useSession: () => ({ data: { user: mockUser, expires: "" }, status: "authenticated" }),
  };
});

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

vi.mock("@/lib/api/project-cronograma", () => ({
  getCronograma: async (projectId: number) => {
    mocks.cronogramaCalls.push(projectId);
    return {
      projectId,
      today: "2026-10-14",
      months: ["2026-09", "2026-10", "2026-12"],
      goals: [],
      activities: [
        { id: 40, order: 1, description: "Etapa vigente" },
        { id: 41, order: 2, description: "Etapa futura" },
      ],
    };
  },
}));

function renderBoard() {
  // QueryClient NOVO por teste: o cache de `useProjects` é por chave, e um cliente compartilhado
  // entre testes faria o segundo teste ver a lista de projetos do primeiro (medido: "Projeto Beta"
  // não aparecia porque a query já estava em cache com staleTime de 5 min).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <SessionProvider session={null}>
      <QueryClientProvider client={queryClient}>
        {/* `hasMemory` + `rateLimitFactor` (medidos): sem memória o adapter não atualiza o
            snapshot da URL em `updateUrl`; com rate limit 0 cada um dos seis setters da barra
            flusha individualmente contra a base que tinha e desfaz o vizinho. O fator agrupa a
            rajada numa atualização só — o comportamento que o adapter de produção tem. */}
        <NuqsTestingAdapter hasMemory rateLimitFactor={1}>
          <TaskBoard />
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </SessionProvider>,
  );
}

async function selectOption(comboboxName: string, optionName: string) {
  const user = userEvent.setup({ delay: null });
  await user.click(await screen.findByRole("combobox", { name: comboboxName }));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

beforeEach(() => {
  resetTaskStore();
  resetUserStore();
  mocks.cronogramaCalls = [];
  seedProjects([{ id: 3, name: "Projeto Alfa", leaderId: 2 }]);
  seedTasks([
    { title: "Task da etapa vigente", status: "to-do", assigneeIds: [2], taskVisibility: "delegated", projectId: 3, activityId: 40 },
    { title: "Task da outra etapa", status: "to-do", assigneeIds: [2], taskVisibility: "delegated", projectId: 3, activityId: 41 },
    { title: "Task sem etapa", status: "to-do", assigneeIds: [2], taskVisibility: "delegated", projectId: 3, activityId: null },
  ]);
});

describe("TaskBoard — filtro por atividade (V5-6, DEC-99)", () => {
  it("sem projeto selecionado não há filtro de atividade", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Task da etapa vigente")).toBeVisible());

    expect(screen.queryByRole("combobox", { name: "Filtrar tarefas por atividade" })).not.toBeInTheDocument();
    // e o quadro não busca cronograma de projeto nenhum
    expect(mocks.cronogramaCalls).toEqual([]);
  });

  it("com projeto selecionado o filtro aparece, alimentado pelo cronograma do projeto", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Task da etapa vigente")).toBeVisible());

    await selectOption("Filtrar tarefas por projeto", "Projeto Alfa");

    expect(await screen.findByRole("combobox", { name: "Filtrar tarefas por atividade" })).toBeVisible();
    expect(mocks.cronogramaCalls).toEqual([3]);
  });

  it("filtrar por etapa mostra as tasks daquela etapa — nem a de outra etapa, nem a sem vínculo", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Task da etapa vigente")).toBeVisible());

    await selectOption("Filtrar tarefas por projeto", "Projeto Alfa");
    await selectOption("Filtrar tarefas por atividade", "1. Etapa vigente");

    expect(screen.getByText("Task da etapa vigente")).toBeVisible();
    expect(screen.queryByText("Task da outra etapa")).not.toBeInTheDocument();
    expect(screen.queryByText("Task sem etapa")).not.toBeInTheDocument();
  });

  it("\"Limpar filtros\" limpa a atividade do corpo de filtros", async () => {
    // Prova na toolbar, não no quadro: a rajada dos seis setters do quadro assenta assíncrono
    // no adapter de teste de URL (limite medido do NuqsTestingAdapter sob carga paralela — o
    // estado final chegava revertido). O que a toolbar promete é o corpo vazio; o resto é nuqs.
    const received: TaskFilters[] = [];
    render(
      <BoardToolbar
        filters={{ projectId: 3, activityId: 40 }}
        onFiltersChange={(next) => received.push(next)}
        overdueCount={0}
        canCreateTasks
        canSeeProjectSelector
        projects={[{ id: 3, name: "Projeto Alfa" }]}
        users={[]}
        activities={[{ id: 40, order: 1, description: "Etapa vigente" }]}
        currentUserId={null}
        isCompact={false}
        onToggleCompact={() => {}}
        onCreateTask={() => {}}
        isUpdating={false}
      />,
    );

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));

    expect(received).toEqual([{}]);
  });

  it("trocar de projeto descarta a atividade escolhida", async () => {
    seedProjects([
      { id: 3, name: "Projeto Alfa", leaderId: 2 },
      { id: 4, name: "Projeto Beta", leaderId: 2 },
    ]);
    renderBoard();
    await waitFor(() => expect(screen.getByText("Task da etapa vigente")).toBeVisible());

    await selectOption("Filtrar tarefas por projeto", "Projeto Alfa");
    await selectOption("Filtrar tarefas por atividade", "1. Etapa vigente");
    expect(screen.queryByText("Task sem etapa")).not.toBeInTheDocument();

    await selectOption("Filtrar tarefas por projeto", "Projeto Beta");
    await selectOption("Filtrar tarefas por projeto", "Projeto Alfa");

    // A prova é de volta ao Alfa: se a atividade do projeto antigo tivesse sobrevivido no corpo,
    // só "Task da etapa vigente" reapareceria. Descartada, as três voltam.
    await waitFor(() => expect(screen.getByText("Task da etapa vigente")).toBeVisible());
    expect(screen.getByText("Task da outra etapa")).toBeVisible();
    expect(screen.getByText("Task sem etapa")).toBeVisible();
  });
});
