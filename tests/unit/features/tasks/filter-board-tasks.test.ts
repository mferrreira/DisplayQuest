import { describe, expect, it } from "vitest";
import { filterBoardTasks } from "@/features/tasks/utils/filter-board-tasks";
import { makeTask } from "@/tests/mocks/fixtures/tasks";

describe("filterBoardTasks — filtro 'você'", () => {
  it("global public quest with no assignee appears for any user", () => {
    const quest = makeTask({ id: 100, title: "Registrar presença", isGlobal: true, taskVisibility: "public", projectId: null, assigneeIds: [], assignedTo: null });
    const delegated = makeTask({ id: 101, title: "Tarefa delegada", taskVisibility: "delegated", projectId: null, assigneeIds: [], assignedTo: null });
    const result = filterBoardTasks([quest, delegated], { assigneeId: 7 });
    expect(result.map((t) => t.id)).toEqual([100]);
    expect(filterBoardTasks([quest], { assigneeId: 42 }).map((t) => t.id)).toEqual([100]);
  });

  it("quest tied to a project does not open to everyone under the you filter", () => {
    const projectQuest = makeTask({ id: 200, title: "Etapa do projeto", isGlobal: false, taskVisibility: "public", projectId: 5, assigneeIds: [], assignedTo: null });
    expect(filterBoardTasks([projectQuest], { assigneeId: 7, projectId: 5 })).toEqual([]);
  });

  it("a quest that has assignees keeps the ordinary assignee check", () => {
    const quest = makeTask({ id: 300, title: "Quest com dono", isGlobal: true, taskVisibility: "public", projectId: null, assigneeIds: [7] });
    expect(filterBoardTasks([quest], { assigneeId: 7 }).map((t) => t.id)).toEqual([300]);
    expect(filterBoardTasks([quest], { assigneeId: 9 })).toEqual([]);
  });

  it("without an assigneeId filter, everything stays", () => {
    const quest = makeTask({ id: 100, title: "Registrar presença", isGlobal: true, taskVisibility: "public" });
    const delegated = makeTask({ id: 101, title: "Tarefa delegada", assigneeIds: [3] });
    expect(filterBoardTasks([quest, delegated], {}).map((t) => t.id)).toEqual([100, 101]);
  });
});
