/**
 * Fix 4 (2026-10-28): a linha do cronograma com conclusão solicitada fica avermelhada.
 *
 * Mesma paleta do cartão de tarefa vencida (`border-destructive/50 bg-destructive/5`) e do rótulo
 * de status. O jsdom não carrega CSS, então a prova é a CLASSE na linha `<tr>` e no texto do status
 * — a cor só aparece no navegador. A linha sem solicitação fica neutra.
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { CronogramaEditor, type CronogramaActivityRow } from "@/components/features/cronograma-editor"

const noop = () => {}

function activityRow(overrides: Partial<CronogramaActivityRow> = {}): CronogramaActivityRow {
  return {
    id: 1,
    order: 1,
    description: "Coleta de dados",
    responsibleId: null,
    firstMonth: "2026-04",
    lastMonth: "2026-06",
    status: "OPEN",
    requestedBy: null,
    requestedAt: null,
    ...overrides,
  }
}

function renderEditor(activities: CronogramaActivityRow[]) {
  render(
    <CronogramaEditor
      months={["2026-04", "2026-05", "2026-06"]}
      goals={[]}
      activities={activities}
      memberOptions={[]}
      today="2026-05"
      canManage
      onAddGoal={noop}
      onGoalChange={noop}
      onDeleteGoal={noop}
      onAddActivity={noop}
      onActivityChange={noop}
      onToggleMonth={noop}
      onDeleteActivity={noop}
    />,
  )
}

describe("CronogramaEditor — linha com conclusão solicitada avermelhada (fix 4)", () => {
  it("a linha COMPLETION_REQUESTED carrega a classe destrutiva e o status em vermelho", () => {
    renderEditor([activityRow({ status: "COMPLETION_REQUESTED" })])

    const input = screen.getByLabelText("Descrição da atividade 1")
    const row = input.closest("tr")!
    expect(row.className).toContain("border-destructive/50")
    expect(row.className).toContain("bg-destructive/5")

    const status = screen.getByText("Conclusão solicitada")
    expect(status.className).toContain("text-destructive")
  });

  it("linha OPEN não fica avermelhada", () => {
    renderEditor([activityRow({ status: "OPEN" })])

    const input = screen.getByLabelText("Descrição da atividade 1")
    const row = input.closest("tr")!
    expect(row.className).not.toContain("border-destructive/50")
  })
})
