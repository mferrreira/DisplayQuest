import { describe, expect, it } from "vitest"
import { weeklyTaskCompletions } from "@/features/projects/utils/weekly-completions"

describe("weeklyTaskCompletions", () => {
  it("groups completion timestamps into Monday-to-Sunday calendar weeks", () => {
    const weeks = weeklyTaskCompletions([
      { completedAt: "2026-10-12T12:00:00.000Z" },
      { completedAt: "2026-10-18T12:00:00.000Z" },
      { completedAt: "2026-10-19T12:00:00.000Z" },
      { completedAt: null },
      { completedAt: "not-a-date" },
    ], "2026-10-20", 2)
    expect(weeks).toMatchObject([
      { weekStart: "2026-10-12", weekEnd: "2026-10-18", count: 2 },
      { weekStart: "2026-10-19", weekEnd: "2026-10-25", count: 1 },
    ])
  })

  it("keeps older completions outside the selected eight-week window out of the chart", () => {
    const weeks = weeklyTaskCompletions([{ completedAt: "2026-01-01" }], "2026-10-20")
    expect(weeks).toHaveLength(8)
    expect(weeks.every(week => week.count === 0)).toBe(true)
  })
})
