import { describe, expect, it } from "vitest"
import { projectProgress } from "@/features/projects/utils/project-progress"

const tasks = [
  { id: 1, projectId: 1, status: "done" },
  { id: 2, projectId: 1, status: "to-do" },
  { id: 3, projectId: 2, status: "done" },
] as any

describe("projectProgress", () => {
  it("uses elapsed civil time when both project dates are available", () => {
    expect(projectProgress({ id: 1, startDate: "2026-01-01", endDate: "2026-01-11" }, tasks, "2026-01-06")).toMatchObject({ percent: 50, source: "time", completedTasks: 1, totalTasks: 2 })
  })

  it("falls back to that project's completed task ratio when dates are incomplete", () => {
    expect(projectProgress({ id: 1, startDate: "2026-01-01", endDate: null }, tasks, "2026-01-06")).toMatchObject({ percent: 50, source: "tasks", detail: "1 de 2 tarefas concluídas" })
    expect(projectProgress({ id: 2 }, tasks, "2026-01-06")).toMatchObject({ percent: 100, source: "tasks", totalTasks: 1 })
  })
})
