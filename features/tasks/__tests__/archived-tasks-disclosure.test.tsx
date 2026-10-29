import { describe, expect, it } from "vitest"
import { render, screen, within } from "@testing-library/react"

import { ArchivedTasksDisclosure } from "@/features/tasks/components/archived-tasks-disclosure"
import { makeTask } from "@/tests/mocks/fixtures/tasks"
import type { Task } from "@/entities/task"

const antigas = [
  makeTask({ id: 3, title: "Tarefa antiga A", status: "done", completed: true, completedAt: "2026-05-01T10:00:00.000Z", points: 10 }),
  makeTask({ id: 2, title: "Tarefa antiga B", status: "done", completed: true, completedAt: "2026-05-20T10:00:00.000Z", points: 30 }),
] as Task[]

describe("ArchivedTasksDisclosure (plan-v6, escolha do dono)", () => {
  it("não renderiza nada sem tarefas arquivadas", () => {
    const { container } = render(<ArchivedTasksDisclosure archived={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("anuncia a contagem no sumário, que é o gatilho do `<details>`", () => {
    render(<ArchivedTasksDisclosure archived={antigas} />)
    const summary = screen.getByText(/Concluídas antigas \(2\)/).closest("summary") as HTMLElement
    expect(summary).toBeInTheDocument()
    const details = summary.closest("details") as HTMLDetailsElement
    expect(details.querySelector("summary")).toBe(summary)
  })

  it("aberto, lista em ordem de conclusão (mais recente primeiro) com data pt-BR", () => {
    render(<ArchivedTasksDisclosure archived={antigas} />)
    const details = screen.getByText(/Concluídas antigas/).closest("details") as HTMLDetailsElement
    details.open = true
    const list = within(details.querySelector("ul") as HTMLElement)
    const titulos = list.getAllByText(/Tarefa antiga/).map((el) => el.textContent)
    expect(titulos).toEqual(["Tarefa antiga B", "Tarefa antiga A"])
    expect(list.getByText("20/05/2026")).toBeInTheDocument()
    expect(list.getByText("01/05/2026")).toBeInTheDocument()
    expect(list.getByText("30 pts")).toBeInTheDocument()
  })
})
