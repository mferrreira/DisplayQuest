/**
 * S08 (plan-v11, R8) — subtasks no diálogo de detalhe: visual neutro, sem âmbar.
 *
 * Por que existe: a frase da trava no diálogo era âmbar (`text-amber-700 dark:text-amber-400`).
 * O dono pediu neutral com a contagem "X/N concluídas" permanecendo. Harness do arquivo irmão
 * de features (TaskDetailDialog + SessionProvider + Toaster com stub LOCAL de matchMedia).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";
import { TaskDetailDialog } from "@/features/tasks/components/task-detail-dialog";

// S09: arrastar exige a porta de lista (dono/gestão) — sem sessão, o diálogo renderiza a lista
// em leitura e o arraste é no-op. A mãe do fixture tem `assignedTo: 2` = o usuário da sessão.
const mockUser = { id: 2, name: "Coordenador", email: "coordenador@lab.com", roles: ["COORDENADOR"] };
vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...actual,
    useSession: () => ({ data: { user: mockUser, expires: "" }, status: "authenticated" }),
  };
});
import { seedTasks, resetTaskStore, getTaskStore } from "@/tests/mocks/handlers";
import { makeTask } from "@/tests/mocks/fixtures/tasks";

function installMatchMediaStub() {
  // Medido no irmão: o Toaster do sonner exige matchMedia, que o jsdom não tem.
  window.matchMedia = (() => ({
    value: "",
    matches: false,
    media: "",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
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

function mother() {
  return makeTask({
    id: 501,
    title: "Calibrar o espectrômetro",
    status: "in-progress",
    assignedTo: 2,
    points: 25,
    subtasks: [
      { id: 901, taskId: 501, title: "Ligar a fonte", completed: true, completedAt: "2026-10-21T12:00:00.000Z" },
      { id: 902, taskId: 501, title: "Ajustar o zero", completed: false, completedAt: null },
      { id: 903, taskId: 501, title: "Medir o ruído", completed: false, completedAt: null },
    ],
  });
}

describe("diálogo — subtasks neutras (R8)", () => {
  beforeEach(() => {
    resetTaskStore();
    installMatchMediaStub();
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).matchMedia;
  });

  it("a seção de subtasks não tem âmbar nem classe de aviso", () => {
    const task = mother();
    seedTasks([task]);
    renderDialog(task);
    // O Dialog monta em portal: a raiz do `container` de RTL não vê o conteúdo. A seção é a
    // `<div>` que o cabeçalho "Subtasks" abre, e é ela que o aceite varre.
    const headerRow = screen.getByText("Subtasks").closest("div")!;
    const section = headerRow.parentElement!;
    expect(section.innerHTML).not.toMatch(/amber|warning/);
    expect(section.textContent).toContain("1/3 concluídas");
  });

  it("a frase da trava fica em muted-foreground", () => {
    const task = mother();
    seedTasks([task]);
    renderDialog(task);
    // A frase da trava é `openSubtasksMessage(2, "review")` — identificada pelo texto,
    // não por fragmento que também casa com a contagem e com o rótulo da checkbox.
    const phrase = screen.getByText(/Conclua as 2 subtasks restantes antes de/);
    expect(phrase.className).toContain("text-muted-foreground");
    expect(phrase.className).not.toMatch(/amber/);
  });
});

describe("S09 (R9) — arrastar reordena e grava", () => {
  beforeEach(() => {
    resetTaskStore();
    // O stub de matchMedia é local ao arquivo e o `afterEach` do bloco S08 o remove; cada bloco
    // instala o seu (mesma costura medida no irmão de features).
    installMatchMediaStub();
  });

  it("cada linha da lista tem alça de arraste nomeada", () => {
    const task = mother();
    seedTasks([task]);
    renderDialog(task);
    for (const title of ["Ligar a fonte", "Ajustar o zero", "Medir o ruído"]) {
      expect(screen.getByTestId(`subtask-handle-${title}`)).toBeInTheDocument();
    }
  });

  it("arrastar a linha 2 sobre a linha 1 grava a ordem nova via PUT", async () => {
    const task = mother();
    seedTasks([task]);
    renderDialog(task);

    const first = screen.getByTestId("subtask-handle-Ligar a fonte");
    const second = screen.getByTestId("subtask-handle-Ajustar o zero");

    const dataTransfer = {
      "text/plain": "",
      setData: () => {},
      getData: () => "",
    };
    fireEvent.dragStart(first, { dataTransfer });
    fireEvent.dragOver(second, { dataTransfer });
    fireEvent.drop(second, { dataTransfer });

    await waitFor(() => {
      const stored = getTaskStore().find((t) => t.id === 501);
      expect(stored!.subtasks.map((s) => s.title)).toEqual([
        "Ajustar o zero",
        "Ligar a fonte",
        "Medir o ruído",
      ]);
    });
  });
});
