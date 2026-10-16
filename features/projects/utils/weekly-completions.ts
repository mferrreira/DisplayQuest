import { civilDayOfDate, civilDaysBetween } from "@/backend/domain"

export interface WeeklyCompletion {
  weekStart: string
  weekEnd: string
  label: string
  count: number
}

/** Counts task completion events by calendar week (Monday–Sunday), including this week. */
export function weeklyTaskCompletions(
  tasks: ReadonlyArray<{ completedAt?: string | null }>,
  today: string,
  weekCount = 8,
): WeeklyCompletion[] {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
  const daysSinceMonday = (weekday + 6) % 7
  const todayDate = new Date(`${today}T00:00:00Z`)
  todayDate.setUTCDate(todayDate.getUTCDate() - daysSinceMonday)
  const currentWeekStart = todayDate.toISOString().slice(0, 10)
  const weeks = Array.from({ length: weekCount }, (_, index) => {
    const startDate = new Date(`${currentWeekStart}T00:00:00Z`)
    startDate.setUTCDate(startDate.getUTCDate() - (weekCount - index - 1) * 7)
    const weekStart = startDate.toISOString().slice(0, 10)
    const endDate = new Date(startDate)
    endDate.setUTCDate(endDate.getUTCDate() + 6)
    const weekEnd = endDate.toISOString().slice(0, 10)
    const [year, month, day] = weekStart.split("-")
    return { weekStart, weekEnd, label: `${day}/${month}`, count: 0 }
  })

  for (const task of tasks) {
    if (!task.completedAt) continue
    const completedDay = civilDayOfDate(task.completedAt)
    if (!completedDay) continue
    const completedDate = new Date(`${completedDay}T00:00:00Z`)
    const completedWeekday = completedDate.getUTCDay()
    completedDate.setUTCDate(completedDate.getUTCDate() - ((completedWeekday + 6) % 7))
    const completedWeekStart = completedDate.toISOString().slice(0, 10)
    const daysBeforeCurrentWeek = civilDaysBetween(completedWeekStart, currentWeekStart)
    if (daysBeforeCurrentWeek < 0) continue
    const weekOffset = daysBeforeCurrentWeek / 7
    const index = weeks.length - 1 - weekOffset
    if (index >= 0) weeks[index].count += 1
  }

  return weeks
}
