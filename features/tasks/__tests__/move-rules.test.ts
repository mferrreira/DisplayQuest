import { describe, expect, it } from "vitest"
import {
  isArchivedTask,
  isTaskOverdue,
  latePenalty,
  optimisticStatusFor,
  parseBacklogLines,
  projectedAward,
  resolveMove,
} from "../utils/move-rules"
import { makeTask } from "@/tests/mocks/fixtures/tasks"

describe("resolveMove (legacy kanban-board.tsx:137–164 parity)", () => {
  const delegated = makeTask({ taskVisibility: "delegated" })
  const publicTask = makeTask({ taskVisibility: "public" })
  const globalTask = makeTask({ isGlobal: true, taskVisibility: "public" })
  const doneTask = makeTask({ status: "done", completed: true })

  it("non-leader cannot move a task OUT of done", () => {
    const decision = resolveMove({ task: doneTask, target: "in-progress", isLeader: false })
    expect(decision).toEqual({ kind: "blocked", reason: "done-is-terminal-for-non-leaders" })
  })

  it("leader CAN move out of done", () => {
    const decision = resolveMove({ task: doneTask, target: "in-progress", isLeader: true })
    expect(decision).toEqual({ kind: "status-update", status: "in-progress" })
  })

  it("non-leader to-done on delegated remaps to in-review", () => {
    const decision = resolveMove({ task: delegated, target: "done", isLeader: false })
    expect(decision).toEqual({ kind: "remap-to-review" })
  })

  it("non-leader to-done on public/global completes directly", () => {
    expect(resolveMove({ task: publicTask, target: "done", isLeader: false })).toEqual({
      kind: "complete",
      status: "done",
    })
    expect(resolveMove({ task: globalTask, target: "done", isLeader: false })).toEqual({
      kind: "complete",
      status: "done",
    })
  })

  it("leader to-done on delegated is a complete call (server sends to review)", () => {
    expect(resolveMove({ task: delegated, target: "done", isLeader: true })).toEqual({
      kind: "complete",
      status: "done",
    })
  })

  it("ordinary moves are status updates", () => {
    expect(resolveMove({ task: delegated, target: "in-progress", isLeader: false })).toEqual({
      kind: "status-update",
      status: "in-progress",
    })
  })
})

describe("optimisticStatusFor (gateway :401 mirror)", () => {
  it("complete on public/global shows done; delegated shows in-review", () => {
    const complete = { kind: "complete" as const, status: "done" as const }
    expect(optimisticStatusFor(complete, { taskVisibility: "public", isGlobal: false })).toBe("done")
    expect(optimisticStatusFor(complete, { taskVisibility: "delegated", isGlobal: false })).toBe("in-review")
    expect(optimisticStatusFor(complete, { taskVisibility: "delegated", isGlobal: true })).toBe("done")
  })
})

describe("archive threshold (legacy :95–109 parity)", () => {
  const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

  it("archives done tasks completed > 7 days ago", () => {
    const task = makeTask({ status: "done", completed: true, completedAt: days(12) })
    expect(isArchivedTask(task)).toBe(true)
  })

  it("keeps done tasks completed within 7 days", () => {
    const task = makeTask({ status: "done", completed: true, completedAt: days(1) })
    expect(isArchivedTask(task)).toBe(false)
  })

  it("never archives non-done tasks", () => {
    const task = makeTask({ status: "to-do", completed: false, completedAt: days(30) })
    expect(isArchivedTask(task)).toBe(false)
  })
})

describe("overdue + penalty (gateway :593–607 mirror)", () => {
  it("flags overdue non-done tasks with past dueDate", () => {
    const overdue = makeTask({ dueDate: new Date(Date.now() - 3 * 864e5).toISOString() })
    const future = makeTask({ dueDate: new Date(Date.now() + 3 * 864e5).toISOString() })
    const doneOverdue = makeTask({
      status: "done",
      completed: true,
      dueDate: new Date(Date.now() - 3 * 864e5).toISOString(),
    })
    expect(isTaskOverdue(overdue)).toBe(true)
    expect(isTaskOverdue(future)).toBe(false)
    expect(isTaskOverdue(doneOverdue)).toBe(false)
  })

  it("penalty = daysLate × points (ceil)", () => {
    const task = { dueDate: new Date(Date.now() - 30 * 3600e3).toISOString(), points: 20 }
    // 30h late → ceil(1.25) = 2 days → 40
    expect(latePenalty(task)).toBe(40)
    expect(projectedAward(task)).toBe(-20)
  })

  it("no dueDate → no penalty", () => {
    expect(latePenalty({ dueDate: null, points: 20 })).toBe(0)
  })
})

describe("parseBacklogLines", () => {
  it("parses one task per line with !priority and @points prefixes", () => {
    const result = parseBacklogLines(
      "Comprar reagentes !alta @30\nEscrever relatório\n\n   \nTestar sensor !urgente @15",
    )
    expect(result).toEqual([
      { title: "Comprar reagentes", priority: "high", points: 30 },
      { title: "Escrever relatório", priority: "medium", points: 0 },
      { title: "Testar sensor", priority: "urgent", points: 15 },
    ])
  })
})
