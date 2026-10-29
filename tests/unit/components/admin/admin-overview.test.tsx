/**
 * Top 5 do painel: a métrica escolhida ordena o placar, e a linha mostra as outras leituras.
 * A conta de horas usa `duration` das sessões fechadas (a sessão ativa tem teste próprio no
 * cronômetro; aqui o relógio real deixaria o caso instável).
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminOverview } from "@/components/admin/AdminOverview";

const users = [
  { id: 1, name: "Ana Souza", points: 60, completedTasks: 9, status: "active", roles: ["COLABORADOR"] },
  { id: 2, name: "Bruno Lima", points: 200, completedTasks: 1, status: "active", roles: ["COLABORADOR"] },
];

const projects = [
  { id: 10, name: "Projeto A", status: "active", members: [{ userId: 1 }] },
  { id: 11, name: "Projeto B", status: "active", leaderId: 2, members: [{ userId: 2 }] },
  { id: 12, name: "Projeto C", status: "active", createdBy: 2, members: [{ userId: 2 }] },
];

const tasks = [
  { id: 1, status: "done", projectId: 10, completedAt: "2026-10-20T12:00:00.000Z" },
  { id: 2, status: "to-do", projectId: 10, completedAt: null },
];

const sessions = [
  { id: 1, userId: 1, status: "finished", startTime: "2026-10-20T08:00:00.000Z", duration: 7200 },
  { id: 2, userId: 2, status: "finished", startTime: "2026-10-20T08:00:00.000Z", duration: 3600 },
];

function renderOverview() {
  return render(
    <AdminOverview users={users} projects={projects} tasks={tasks} sessions={sessions} onManageSessions={() => {}} />,
  );
}

function ranking() {
  const section = screen.getByRole("region", { name: "Top 5 em produtividade" });
  return {
    section,
    names: () => within(section).getAllByRole("listitem").map((item) => item.textContent),
  };
}

describe("AdminOverview — Top 5 em produtividade", () => {
  it("nasce ordenado por pontos", () => {
    renderOverview();
    const { names } = ranking();
    expect(names()[0]).toContain("Bruno Lima");
    expect(names()[1]).toContain("Ana Souza");
  });

  it("trocar a metrica reordena e destaca o botao ativo", async () => {
    const user = userEvent.setup({ delay: null });
    renderOverview();
    const { section, names } = ranking();

    await user.click(within(section).getByRole("button", { name: "Tarefas" }));

    expect(within(section).getByRole("button", { name: "Tarefas" })).toHaveAttribute("aria-pressed", "true");
    expect(names()[0]).toContain("Ana Souza");
    expect(names()[0]).toContain("9 tarefas");
    expect(names()[0]).toContain("60 pts");
  });

  it("horas somam a duracao das sessoes e projetos contam vinculo/lideranca/criacao", async () => {
    const user = userEvent.setup({ delay: null });
    renderOverview();
    const { section, names } = ranking();

    await user.click(within(section).getByRole("button", { name: "Horas" }));
    expect(names()[0]).toContain("Ana Souza");
    expect(names()[0]).toContain("2 h");

    await user.click(within(section).getByRole("button", { name: "Projetos" }));
    expect(names()[0]).toContain("Bruno Lima");
    expect(names()[0]).toContain("2 projetos");
  });
});
