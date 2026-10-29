/**
 * S08 (plan-v11, R8) — subtasks no diálogo de detalhe: visual neutro, sem âmbar.
 *
 * Por que existe: a frase da trava no diálogo era âmbar (`text-amber-700 dark:text-amber-400`).
 * O dono pediu neutral com a contagem "X/N concluídas" permanecendo. Harness do arquivo irmão
 * de features (TaskDetailDialog + SessionProvider + Toaster com stub LOCAL de matchMedia).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";
import { TaskDetailDialog } from "@/features/tasks/components/task-detail-dialog";
import { seedTasks, resetTaskStore } from "@/tests/mocks/handlers";
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
