import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SessionProvider } from "next-auth/react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskBoard } from "@/features/tasks/components/task-board";
import {
  resetProjectStore,
  resetTaskStore,
  resetUserStore,
  seedProjects,
  seedTasks,
  seedUsers,
} from "@/tests/mocks/handlers";

/**
 * R11 (S11): primeira carga do quadro sem `?projeto=`. O quadro abre no projeto do líder, senão
 * no primeiro vínculo de membro, senão na visão global. O chip "Ver todos os projetos" devolve a
 * visão global. O que se prova é o projeto inicial escolhido, medido pelas tarefas que o quadro
 * deixa visíveis — cada projeto tem a sua tarefa, e a filtragem por projeto é o que separa.
 *
 * jsdom não tem `window.matchMedia` (regra da casa), e a busca é desktop-first: sem o stub o
 * quadro cai no caminho mobile. Este teste é desktop.
 */
function stubDesktopViewport(isDesktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: isDesktop && query.includes("min-width"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Um único ator por teste, lido pela mock de topo. `vi.hoisted` é o que faz `actor` existir antes
// das mock de módulo, que são içadas acima do `const` (regra da casa, igual no mock da composition
// root do cron). A variável é mutável: cada caso troca o ator sem re-inscrever o mock.
const actor = vi.hoisted(() => ({ id: 2, roles: ["GERENTE_PROJETO"] as string[] }));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: actor.id, name: `User ${actor.id}`, email: `u${actor.id}@lab.com`, roles: actor.roles }, loading: false }),
}));

vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  const user = { id: actor.id, name: `User ${actor.id}`, email: `u${actor.id}@lab.com`, roles: actor.roles };
  return { ...actual, useSession: () => ({ data: { user, expires: "" }, status: "authenticated" }) };
});

function renderBoard() {
  // Um QueryClient novo por teste: o cache de tarefas é por-chave, e um cliente compartilhado
  // entre casos contamina a lista do teste seguinte. Cada render tem o seu cache limpo.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <SessionProvider session={null}>
      <QueryClientProvider client={qc}>
        <NuqsTestingAdapter>
          <TaskBoard />
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </SessionProvider>,
  );
}

describe("TaskBoard — projeto inicial do quadro (R11)", () => {
  beforeEach(() => {
    resetProjectStore();
    resetTaskStore();
    resetUserStore();
    stubDesktopViewport(true);
    seedUsers([
      { id: 2, name: "Línea", email: "linea@lab.com", points: 5, completedTasks: 1, status: "active", weekHours: 10, roles: ["GERENTE_PROJETO"], profileVisibility: "public" },
      { id: 5, name: "Membro", email: "membro@lab.com", points: 5, completedTasks: 1, status: "active", weekHours: 10, roles: ["VOLUNTARIO"], profileVisibility: "public" },
      { id: 9, name: "Estranho", email: "estranho@lab.com", points: 5, completedTasks: 1, status: "active", weekHours: 10, roles: ["VOLUNTARIO"], profileVisibility: "public" },
    ]);
    seedProjects([
      { id: 1, name: "Projeto da Línea", createdBy: 2, leaderId: 2, status: "active", createdAt: "2026-01-01", isMember: true },
      { id: 2, name: "Projeto do Membro", createdBy: 9, leaderId: 9, status: "active", createdAt: "2026-02-01", isMember: true },
    ]);
    seedTasks([
      { id: 10, title: "Tarefa do projeto 1", status: "to-do", projectId: 1 },
      { id: 20, title: "Tarefa do projeto 2", status: "to-do", projectId: 2 },
    ]);
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).matchMedia;
  });

  it("líder abre no projeto que lidera", async () => {
    actor.id = 2;
    actor.roles = ["GERENTE_PROJETO"];
    renderBoard();
    await new Promise((r)=>setTimeout(r,300));
    process.stdout.write(`LEADER T1=${Boolean(screen.queryByText("Tarefa do projeto 1"))} T2=${Boolean(screen.queryByText("Tarefa do projeto 2"))} chip=${Boolean(screen.queryByRole("button",{name:"Ver todos os projetos"}))}\n`)
    // A primeira renderização ainda não tem o projeto: ela mostra as duas tarefas. Esperamos o
    // estado assentar, onde só a tarefa do projeto liderado sobra.
    await waitFor(() => {
      expect(screen.getByText("Tarefa do projeto 1")).toBeVisible();
      expect(screen.queryByText("Tarefa do projeto 2")).not.toBeInTheDocument();
    });
  });

  it("membro sem liderança abre no primeiro vínculo", async () => {
    actor.id = 5;
    actor.roles = ["VOLUNTARIO"];
    // Línea lidera o projeto 1; o Membro é membro dele, marcado primeiro na lista. Primeiro vínculo
    // é o projeto 1, que fica solo.
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText("Tarefa do projeto 1")).toBeVisible();
      expect(screen.queryByText("Tarefa do projeto 2")).not.toBeInTheDocument();
    });
  });

  it("quem não lidera nem é membro abre na visão global", async () => {
    actor.id = 77;
    actor.roles = ["VOLUNTARIO"];
    seedProjects([
      { id: 1, name: "Projeto A", createdBy: 2, leaderId: 2, status: "active", createdAt: "2026-01-01", isMember: false },
      { id: 2, name: "Projeto B", createdBy: 2, leaderId: 2, status: "active", createdAt: "2026-02-01", isMember: false },
    ]);
    renderBoard();
    // Sem vínculo com o ator: o quadro não filtra, e as duas tarefas de projeto ficam visíveis.
    await waitFor(() => {
      expect(screen.getByText("Tarefa do projeto 1")).toBeVisible();
      expect(screen.getByText("Tarefa do projeto 2")).toBeVisible();
    });
  });

  it("o chip 'Ver todos os projetos' devolve a visão global", async () => {
    actor.id = 2;
    actor.roles = ["GERENTE_PROJETO"];
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText("Tarefa do projeto 1")).toBeVisible();
      expect(screen.queryByText("Tarefa do projeto 2")).not.toBeInTheDocument();
    });
    const chip = await screen.findByRole("button", { name: "Ver todos os projetos" });
    chip.click();
    await waitFor(() => {
      expect(screen.getByText("Tarefa do projeto 2")).toBeVisible();
      expect(screen.getByText("Tarefa do projeto 1")).toBeVisible();
    });
  });
});
