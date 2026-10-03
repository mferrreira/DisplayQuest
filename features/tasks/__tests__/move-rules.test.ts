import { describe, expect, it } from "vitest"
import {
  allowedTargets,
  isArchivedTask,
  isTaskOverdue,
  isTaskDueToday,
  latePenalty,
  optimisticStatusFor,
  parseBacklogLines,
  projectedAward,
  resolveMove,
  sortTasksByUrgencyAndDueDate,
  TASK_STATUSES,
} from "../utils/move-rules"
import { POINTS_PER_TASK } from "../"
import { awardPointsForCompletion, calculateLatePenalty } from "@/backend/domain"
import { makeTask } from "@/tests/mocks/fixtures/tasks"
import type { Task } from "@/entities/task"

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

describe("allowedTargets (plan-v3 OND3-B)", () => {
  const delegated = makeTask({ taskVisibility: "delegated" })
  const publicTask = makeTask({ taskVisibility: "public" })
  const doneTask = makeTask({ status: "done", completed: true })

  it("non-leader has NO destination for a done task (the menu offers nothing)", () => {
    // arrasto de `done` é desabilitado para todo mundo; o menu era o único caminho e
    // devolvia "Ação não permitida" nas quatro opções.
    expect(allowedTargets(doneTask, false)).toEqual([])
  })

  it("leader keeps every other column as a destination for a done task", () => {
    expect(allowedTargets(doneTask, true)).toEqual(["to-do", "in-progress", "in-review", "adjust"])
  })

  it("never offers the column the task is already in", () => {
    for (const status of TASK_STATUSES) {
      for (const isLeader of [true, false]) {
        const targets = allowedTargets({ ...delegated, status }, isLeader)
        expect(targets).not.toContain(status)
      }
    }
  })

  it("never offers a destination the rule blocks (matrix, não amostragem)", () => {
    // A propriedade que o menu depende: offered ⊆ what resolveMove does not block.
    const shapes = [
      { taskVisibility: "delegated" as const, isGlobal: false },
      { taskVisibility: "delegated" as const, isGlobal: true },
      { taskVisibility: "public" as const, isGlobal: false },
      { taskVisibility: "public" as const, isGlobal: true },
    ]
    for (const shape of shapes) {
      for (const status of TASK_STATUSES) {
        for (const isLeader of [true, false]) {
          const task = { ...shape, status }
          const blocked = TASK_STATUSES.filter(
            (t) => resolveMove({ task, target: t, isLeader }).kind === "blocked",
          )
          const offered = allowedTargets(task, isLeader)
          for (const t of blocked) expect(offered).not.toContain(t)
          // a coluna atual não é destino de ninguém; o resto se reparte entre menu e bloqueio
          expect(offered.length + blocked.length).toBe(TASK_STATUSES.length - 1)
        }
      }
    }
  })

  it("keeps offering Concluído a non-leader on a delegated task: the server accepts and routes to review", () => {
    // complete-task.use-case.ts:148 — concluir tarefa delegada devolve `in-review`, então
    // retirar a opção aqui esconderia o caminho de "entregar para aprovação".
    expect(allowedTargets(delegated, false)).toContain("done")
    expect(allowedTargets(publicTask, false)).toContain("done")
  })

  it("non-leader on a non-done task can reach every other column", () => {
    expect(allowedTargets(delegated, false)).toEqual(["in-progress", "in-review", "adjust", "done"])
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

  it("isTaskOverdue is false for a task due today (date-only comparison)", () => {
    const today = new Date()
    const dueToday = makeTask({ dueDate: today.toISOString(), status: "to-do" })
    expect(isTaskOverdue(dueToday)).toBe(false)
  })

  it("isTaskDueToday flags non-done tasks due today and nothing else", () => {
    const today = new Date()
    const dueToday = makeTask({ dueDate: today.toISOString(), status: "to-do" })
    const tomorrow = new Date()
    tomorrow.setDate(today.getDate() + 1)
    const dueTomorrow = makeTask({ dueDate: tomorrow.toISOString(), status: "to-do" })
    const doneToday = makeTask({ dueDate: today.toISOString(), status: "done", completed: true })
    const noDue = makeTask({ dueDate: null, status: "to-do" })
    expect(isTaskDueToday(dueToday)).toBe(true)
    expect(isTaskDueToday(dueTomorrow)).toBe(false)
    expect(isTaskDueToday(doneToday)).toBe(false)
    expect(isTaskDueToday(noDue)).toBe(false)
  })

  it("plan-v3 OND1-C: penalidade e premiação vêm da regra do domínio, não de uma cópia local (AC-P3-02)", () => {
    const completion = new Date("2026-06-17T12:00:00.000Z")
    const task = { dueDate: "2026-06-15", points: 20 }
    // 2 dias civis de atraso × POINTS_PER_TASK — e 10 fixos na premiação, não os 20 gravados.
    expect(latePenalty(task, completion)).toBe(20)
    expect(projectedAward(task, completion)).toBe(-10)
    // Os dois números são as mesmas funções que o backend usa para creditar.
    expect(latePenalty(task, completion)).toBe(calculateLatePenalty(task, completion))
    expect(projectedAward(task, completion)).toBe(awardPointsForCompletion(task, completion))
  })

  it("no dueDate → no penalty, e vale POINTS_PER_TASK", () => {
    expect(latePenalty({ dueDate: null })).toBe(0)
    expect(projectedAward({ dueDate: null })).toBe(POINTS_PER_TASK)
  })
})

describe("sortTasksByUrgencyAndDueDate", () => {
  const task = (id: number, priority: Task["priority"], dueDate: string | null = null) => ({ id, title: `t${id}`, status: "to-do" as const, priority, dueDate })

  it("orders by urgency first (urgent > high > medium > low)", () => {
    const list = [
      task(1, "low"),
      task(2, "urgent"),
      task(3, "high"),
      task(4, "medium"),
    ]
    expect(sortTasksByUrgencyAndDueDate(list).map((t) => t.id)).toEqual([2, 3, 4, 1])
  })

  it("within the same urgency, sorts by due date ascending (same-date ties newest-first)", () => {
    const list = [
      task(1, "high", "2026-12-20"),
      task(2, "high", "2026-11-01"),
      task(3, "high", "2026-11-01"),
    ]
    expect(sortTasksByUrgencyAndDueDate(list).map((t) => t.id)).toEqual([3, 2, 1])
  })

  it("puts tasks without dueDate at the bottom of their urgency group", () => {
    const list = [
      task(1, "medium", null),
      task(2, "medium", "2026-11-05"),
      task(3, "medium", "2026-10-01"),
    ]
    expect(sortTasksByUrgencyAndDueDate(list).map((t) => t.id)).toEqual([3, 2, 1])
  })

  it("breaks due-date ties newest-first (id desc parity)", () => {
    const list = [
      task(5, "urgent", "2026-11-01"),
      task(8, "urgent", "2026-11-01"),
      task(2, "urgent", "2026-11-01"),
    ]
    expect(sortTasksByUrgencyAndDueDate(list).map((t) => t.id)).toEqual([8, 5, 2])
  })

  it("does not mutate the input array", () => {
    const list = [task(1, "low"), task(2, "urgent")]
    const snapshot = [...list]
    sortTasksByUrgencyAndDueDate(list)
    expect(list).toEqual(snapshot)
  })
})

describe("parseBacklogLines", () => {
  it("parses one task per line com !prioridade, @pontos e #vencimento (plan-v3 DEC-41)", () => {
    const result = parseBacklogLines(
      "Comprar reagentes !alta @30\nEscrever relatório\n\n   \nTestar sensor !urgente @15",
    )
    // O `@N` é aceito e ignorado (DEC-41): sai do título, não volta no tipo.
    expect(result).toEqual([
      { title: "Comprar reagentes", priority: "high", dueDate: null },
      { title: "Escrever relatório", priority: "medium", dueDate: null },
      { title: "Testar sensor", priority: "urgent", dueDate: null },
    ])
  })

  it("parses #dd/mm dates (current year)", () => {
    const year = new Date().getFullYear()
    const result = parseBacklogLines("Comprar reagentes #25/12\nCalibrar #1/3")
    expect(result).toEqual([
      { title: "Comprar reagentes", priority: "medium", dueDate: `${year}-12-25` },
      { title: "Calibrar", priority: "medium", dueDate: `${year}-03-01` },
    ])
  })

  it("parses #dd/mm/yyyy dates with explicit year", () => {
    const result = parseBacklogLines("Relatório #15/06/2027")
    expect(result).toEqual([
      { title: "Relatório", priority: "medium", dueDate: "2027-06-15" },
    ])
  })

  it("parses all tokens together", () => {
    const year = new Date().getFullYear()
    const result = parseBacklogLines("Comprar reagentes !alta @30 #25/12")
    expect(result).toEqual([
      { title: "Comprar reagentes", priority: "high", dueDate: `${year}-12-25` },
    ])
  })

  it("ignores invalid dates gracefully", () => {
    const result = parseBacklogLines("Tarefa #32/13\nOutra #abc")
    expect(result).toEqual([
      { title: "Tarefa #32/13", priority: "medium", dueDate: null },
      { title: "Outra #abc", priority: "medium", dueDate: null },
    ])
  })
})
