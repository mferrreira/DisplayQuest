import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DailyLogList } from "@/components/ui/daily-log-list"
import type { DailyLog } from "@/contexts/types"

function log(id: number, date: string): DailyLog {
  return {
    id,
    userId: 1,
    date: new Date(date),
    note: `registro ${id}`,
    createdAt: new Date(date),
  } as DailyLog
}

describe("DailyLogList", () => {
  it("mostra o registro mais recente primeiro (crescente vira decrescente)", () => {
    // A API devolve crescente: 01, 02, 03.
    const logs = [log(1, "2026-10-01T10:00:00.000Z"), log(2, "2026-10-02T10:00:00.000Z"), log(3, "2026-10-03T10:00:00.000Z")]

    render(<DailyLogList logs={logs} currentUser={null} isSubmitting={false} />)

    const rendered = screen.getAllByText(/^registro \d$/).map((node) => node.textContent)
    expect(rendered).toEqual(["registro 3", "registro 2", "registro 1"])
  })

  it("empate de data desempata pelo id, maior primeiro", () => {
    const sameDay = "2026-10-02T10:00:00.000Z"
    const logs = [log(7, sameDay), log(9, sameDay), log(8, sameDay)]

    render(<DailyLogList logs={logs} currentUser={null} isSubmitting={false} />)

    const rendered = screen.getAllByText(/^registro \d$/).map((node) => node.textContent)
    expect(rendered).toEqual(["registro 9", "registro 8", "registro 7"])
  })

  it("não reordena a lista recebida", () => {
    const logs = [log(1, "2026-10-01T10:00:00.000Z"), log(2, "2026-10-02T10:00:00.000Z")]
    const snapshot = logs.map((entry) => entry.id)

    render(<DailyLogList logs={logs} currentUser={null} isSubmitting={false} />)

    expect(logs.map((entry) => entry.id)).toEqual(snapshot)
  })
})
