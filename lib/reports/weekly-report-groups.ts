import type { WeeklyReport } from "@/contexts/types"

export interface WeeklyReportWeekGroup {
  key: string
  reports: WeeklyReport[]
}

export interface WeeklyReportMonthGroup {
  key: string
  weeks: WeeklyReportWeekGroup[]
}

export function groupWeeklyReportsByMonth(reports: WeeklyReport[]): WeeklyReportMonthGroup[] {
  const months: WeeklyReportMonthGroup[] = []
  for (const report of reports) {
    const weekKey = new Date(report.weekStart).toISOString().slice(0, 10)
    const monthKey = weekKey.slice(0, 7)
    let month = months.find((m) => m.key === monthKey)
    if (!month) {
      month = { key: monthKey, weeks: [] }
      months.push(month)
    }
    let week = month.weeks.find((w) => w.key === weekKey)
    if (!week) {
      week = { key: weekKey, reports: [] }
      month.weeks.push(week)
    }
    week.reports.push(report)
  }
  months.sort((a, b) => b.key.localeCompare(a.key))
  for (const month of months) {
    month.weeks.sort((a, b) => b.key.localeCompare(a.key))
  }
  return months
}

export function weekHeadingLabel(group: WeeklyReportWeekGroup): string {
  const fmt = (date: Date | string) => new Date(date).toLocaleDateString("pt-BR")
  return `${fmt(group.reports[0].weekStart)} - ${fmt(group.reports[0].weekEnd)}`
}

export function monthHeadingLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number)
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
