import { describe, expect, it } from "vitest"

import { groupWeeklyReportsByMonth, monthHeadingLabel, weekHeadingLabel } from "@/lib/reports/weekly-report-groups"
import type { WeeklyReport } from "@/contexts/types"

const relatorio = (id: number, weekStart: string, userName: string) =>
  ({ id, weekStart, weekEnd: weekEndDate(weekStart), userId: id, userName }) as unknown as WeeklyReport

function weekEndDate(weekStart: string): string {
  const start = new Date(weekStart)
  start.setUTCDate(start.getUTCDate() + 6)
  return start.toISOString()
}

describe("groupWeeklyReportsByMonth (plan-v6, pedido do dono: mês/ano → semana → lista)", () => {
  it("rola reports da mesma semana para dentro do mesmo mês e da mesma semana", () => {
    const grupos = groupWeeklyReportsByMonth([
      relatorio(1, "2026-10-12T03:00:00.000Z", "Ana"),
      relatorio(2, "2026-10-12T05:00:00.000Z", "Bruno"),
      relatorio(3, "2026-09-14T05:00:00.000Z", "Ana"),
    ])
    expect(grupos).toHaveLength(2)
    expect(grupos[0].key).toBe("2026-10")
    expect(grupos[0].weeks).toHaveLength(1)
    expect(grupos[0].weeks[0].key).toBe("2026-10-12")
    expect(grupos[0].weeks[0].reports.map((r) => r.userName)).toEqual(["Ana", "Bruno"])
  })

  it("nenhum mês acrescenta na ordem: o mais recente primeiro (e a semana idem)", () => {
    const grupos = groupWeeklyReportsByMonth([
      relatorio(1, "2026-08-10T05:00:00.000Z", "Ana"),
      relatorio(2, "2026-10-12T05:00:00.000Z", "Ana"),
      relatorio(3, "2026-10-05T05:00:00.000Z", "Bruno"),
      relatorio(4, "2026-09-14T05:00:00.000Z", "Ana"),
    ])
    expect(grupos.map((g) => g.key)).toEqual(["2026-10", "2026-09", "2026-08"])
    expect(grupos[0].weeks.map((w) => w.key)).toEqual(["2026-10-12", "2026-10-05"])
  })

  it("rotulo do mês em pt-BR com capital própria", () => {
    expect(monthHeadingLabel("2026-10")).toBe("Outubro de 2026")
  })

  it("rotulo da semana lê o intervalo de segunda a domingo", () => {
    const grupos = groupWeeklyReportsByMonth([relatorio(1, "2026-10-12T03:00:00.000Z", "Ana")])
    expect(weekHeadingLabel(grupos[0].weeks[0])).toBe("12/10/2026 - 18/10/2026")
  })
})
