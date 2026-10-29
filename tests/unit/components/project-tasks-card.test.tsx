/**
 * S04 (plan-v11, R4) — a lista "Tarefas do Projeto" tem teto fixo com rolagem interna.
 *
 * Por que existe: a lista era um `space-y-3` sem teto dentro da página; com 30 tarefas a
 * página esticava sem fim. O aceite congela o teto da casa (320px, o mesmo do feed
 * "Atividade recente" da V6-11k) e a rolagem interna, e prova os controles da linha.
 *
 * Costuras medidas: `sr-only` dentro de scroller exige ancestral `relative` (licão da
 * V6-11h) — este card não tem `sr-only`, mas o scroller recebe `relative` por contrato;
 * `userEvent.setup({ delay: null })` para o clique sob carga.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProjectTasksCard } from "@/components/features/project-tasks-card";
import type { Task } from "@/contexts/types";

function makeTasks(n: number): Task[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    title: `Tarefa ${i + 1}`,
    description: null,
    status: "to-do",
    priority: "medium",
    points: 10,
    completed: false,
    dueDate: null,
    projectId: 9,
    isGlobal: false,
    taskVisibility: "private",
    createdAt: "2026-01-01T12:00:00.000Z",
    assignedTo: 1,
  })) as Task[];
}

const users = [{ id: 1, name: "Ana", email: "ana@lab" }];

describe("ProjectTasksCard — teto rolável (R4)", () => {
  it("a lista de tarefas tem teto de 320px com rolagem interna", () => {
    render(
      <ProjectTasksCard
        tasks={makeTasks(30)}
        users={users}
        canCreate={false}
        onCreateTask={vi.fn()}
        onImportBacklog={vi.fn()}
        onEditTask={vi.fn()}
      />
    );

    // A primeira linha existe; o scroller que a contém tem o teto da casa.
    const firstRow = screen.getByText("Tarefa 1").closest("li");
    expect(firstRow).not.toBeNull();
    const scroller = firstRow!.closest('[class*="max-h-80"]');
    expect(scroller).not.toBeNull();
    expect(scroller!.className).toContain("overflow-y-auto");
    expect(scroller!.className).toContain("relative");
    expect(screen.getByText("Tarefa 30")).toBeInTheDocument();
  });

  it("cada linha tem o botão de editar e chama o callback com a tarefa", async () => {
    const onEditTask = vi.fn();
    const user = userEvent.setup({ delay: null });
    render(
      <ProjectTasksCard
        tasks={makeTasks(3)}
        users={users}
        canCreate={false}
        onCreateTask={vi.fn()}
        onImportBacklog={vi.fn()}
        onEditTask={onEditTask}
      />
    );

    await user.click(screen.getByRole("button", { name: "Editar tarefa Tarefa 2" }));
    expect(onEditTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, title: "Tarefa 2" })
    );
  });

  it("estado vazio: título e nenhuma linha; o botão criar só aparece com canCreate", () => {
    render(
      <ProjectTasksCard
        tasks={[]}
        users={users}
        canCreate={false}
        onCreateTask={vi.fn()}
        onImportBacklog={vi.fn()}
        onEditTask={vi.fn()}
      />
    );

    expect(screen.getByText("Nenhuma tarefa encontrada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar tarefa Tarefa 1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Criar Primeira Tarefa" })).toBeNull();
  });

  it("as ações do cabeçalho só aparecem com canCreate", () => {
    render(
      <ProjectTasksCard
        tasks={makeTasks(2)}
        users={users}
        canCreate={true}
        onCreateTask={vi.fn()}
        onImportBacklog={vi.fn()}
        onEditTask={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Nova Tarefa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importar Backlog" })).toBeInTheDocument();
  });
});
