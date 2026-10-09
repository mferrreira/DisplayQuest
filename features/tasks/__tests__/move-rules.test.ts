import { describe, expect, it } from "vitest"
import {
  allowedTargets,
  isArchivedTask,
  isTaskOverdue,
  isTaskDueToday,
  latePenalty,
  moveBlockedMessage,
  optimisticStatusFor,
  parseBacklogLines,
  projectedAward,
  resolveMove,
  sortTasksByUrgencyAndDueDate,
  TASK_STATUSES,
} from "../utils/move-rules"
import { POINTS_PER_TASK } from "../"
import type { MoveDecision } from "../utils/move-rules"
import { awardPointsForCompletion, calculateLatePenalty, openSubtasksMessage } from "@/backend/domain"
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

/**
 * plan-v4 · V4-5 (DEC-57, DEC-80) — a trava também mora na decisão de DISPLAY.
 *
 * O servidor já recusa (V4-4). Aqui a regra entra porque o dono pediu que a UI **desabilite** o
 * movimento, além de bloqueá-lo: "não em vez de". E ela é derivada das mesmas funções do domínio
 * (`SUBTASK_BLOCKED_TARGETS`, `openSubtasksMessage`), não reescrita — o menu e o clique não podem
 * divergir um do outro, e nenhum dos dois pode divergir do servidor.
 */
describe("trava de subtask na decisão de movimento (plan-v4 · V4-5)", () => {
  const openTwo: Task["subtasks"] = [
    { id: 1, taskId: 7, title: "Medir a bancada", completed: false, completedAt: null },
    { id: 2, taskId: 7, title: "Registrar a leitura", completed: false, completedAt: null },
  ]
  const oneOpenOfThree: Task["subtasks"] = [
    { id: 1, taskId: 7, title: "Medir a bancada", completed: true, completedAt: null },
    { id: 2, taskId: 7, title: "Registrar a leitura", completed: false, completedAt: null },
    { id: 3, taskId: 7, title: "Checar a escala", completed: true, completedAt: null },
  ]
  const allClosed: Task["subtasks"] = openTwo.map((s) => ({ ...s, completed: true }))

  it("subtask aberta barra o destino Em Revisão vindo de QUALQUER coluna", () => {
    for (const status of ["to-do", "in-progress", "adjust"] as const) {
      const task = makeTask({ status, subtasks: openTwo })
      // Até para líder: a trava é sobre o destino, não sobre quem move.
      expect(resolveMove({ task, target: "in-review", isLeader: true })).toEqual({
        kind: "blocked",
        reason: "subtasks-open",
        openCount: 2,
      })
    }
  })

  it("subtask aberta barra Concluído — inclusive o remapeamento que terminaria em Em Revisão", () => {
    // Quem não é líder move delegada para "Concluído" e o servidor devolve para revisão
    // (`remap-to-review`). O destino FINAL é Em Revisão, então a trava tem que entrar ANTES do
    // remapeamento: senão a UI ofereceria o movimento, o servidor recusaria e a trava viraria
    // toast de erro em vez de botão desabilitado.
    const task = makeTask({ status: "in-progress", subtasks: openTwo })
    expect(resolveMove({ task, target: "done", isLeader: false })).toEqual({
      kind: "blocked",
      reason: "subtasks-open",
      openCount: 2,
    })
    expect(resolveMove({ task, target: "done", isLeader: true })).toEqual({
      kind: "blocked",
      reason: "subtasks-open",
      openCount: 2,
    })
  })

  it("voltar para A Fazer / Em Andamento / Ajustes continua livre (DEC-80)", () => {
    const task = makeTask({ status: "in-review", subtasks: openTwo })
    for (const target of ["to-do", "in-progress", "adjust"] as const) {
      expect(resolveMove({ task, target, isLeader: false })).toEqual({
        kind: "status-update",
        status: target,
      })
    }
  })

  it("só a subtask ABERTA conta: uma concluída não trava nada", () => {
    const task = makeTask({ status: "in-progress", subtasks: oneOpenOfThree })
    expect(resolveMove({ task, target: "in-review", isLeader: false })).toEqual({
      kind: "blocked",
      reason: "subtasks-open",
      openCount: 1,
    })
    expect(resolveMove({ task: makeTask({ status: "in-progress", subtasks: allClosed }), target: "in-review", isLeader: false })).toEqual({
      kind: "status-update",
      status: "in-review",
    })
  })

  it("sem subtask, nada muda para tarefa simples", () => {
    const task = makeTask({ status: "in-progress" })
    expect(resolveMove({ task, target: "in-review", isLeader: false })).toEqual({
      kind: "status-update",
      status: "in-review",
    })
    expect(allowedTargets(task, false)).toEqual(["to-do", "in-review", "adjust", "done"])
  })

  it("allowedTargets não oferece o destino barrado — o menu é derivado da mesma regra", () => {
    const task = makeTask({ status: "in-progress", subtasks: openTwo })
    expect(allowedTargets(task, false)).toEqual(["to-do", "adjust"])
    expect(allowedTargets(task, true)).toEqual(["to-do", "adjust"])
  })

  it("a mensagem é a MESMA do servidor (`openSubtasksMessage`), singular incluído", () => {
    expect(openSubtasksMessage(2, "review")).toBe("Conclua as 2 subtasks restantes antes de enviar para revisão")
    expect(openSubtasksMessage(1, "review")).toBe("Conclua a subtask restante antes de enviar para revisão")
    expect(openSubtasksMessage(3, "approve")).toBe("Conclua as 3 subtasks restantes antes de aprovar a tarefa")
  })

  it("`moveBlockedMessage` diz o verbo do destino pedido — é uma cópia só para cartão e arrasto", () => {
    const blocked = resolveMove({
      task: makeTask({ status: "in-progress", subtasks: openTwo }),
      target: "in-review",
      isLeader: false,
    })
    expect(moveBlockedMessage(blocked as Extract<MoveDecision, { kind: "blocked" }>, "in-review")).toBe(
      "Conclua as 2 subtasks restantes antes de enviar para revisão",
    )
    const blockedDone = resolveMove({
      task: makeTask({ status: "in-progress", subtasks: openTwo }),
      target: "done",
      isLeader: true,
    })
    expect(moveBlockedMessage(blockedDone as Extract<MoveDecision, { kind: "blocked" }>, "done")).toBe(
      "Conclua as 2 subtasks restantes antes de concluir a tarefa",
    )
    // A trava antiga continua com a frase antiga.
    const legacy = resolveMove({ task: makeTask({ status: "done" }), target: "in-progress", isLeader: false })
    expect(moveBlockedMessage(legacy as Extract<MoveDecision, { kind: "blocked" }>, "in-progress")).toBe(
      "Apenas líderes de projeto podem mover tarefas concluídas.",
    )
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
