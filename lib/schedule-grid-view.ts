import { TIME_SLOTS } from "@/lib/constants/schedule-grid"

export interface GridSchedule {
  id?: number
  userId: number
  dayOfWeek: number
  startTime: string
  endTime: string
}

/**
 * Janela visível da grade: apenas os slots de tempo entre o início mais cedo e
 * o fim mais tarde dos horários cadastrados. Sem horários, retorna todos os
 * slots padrão.
 */
export function getVisibleTimeSlots(
  schedules: Pick<GridSchedule, "startTime" | "endTime">[],
  allSlots: { start: string; end: string }[] = TIME_SLOTS,
): { start: string; end: string }[] {
  if (schedules.length === 0) return allSlots

  const minStart = schedules.reduce((min, s) => (s.startTime < min ? s.startTime : min), "23:59")
  const maxEnd = schedules.reduce((max, s) => (s.endTime > max ? s.endTime : max), "00:00")

  const firstIdx = allSlots.findIndex((slot) => slot.end > minStart)
  const lastIdx = (() => {
    for (let i = allSlots.length - 1; i >= 0; i--) {
      if (allSlots[i].start < maxEnd) return i
    }
    return -1
  })()

  if (firstIdx === -1 || lastIdx === -1) return allSlots
  return allSlots.slice(firstIdx, lastIdx + 1)
}

/**
 * Agrupa horários por usuário para a visão compacta mobile:
 * [{ user, days: [{ label, range }] }]
 */
export function groupSchedulesByUser(
  schedules: GridSchedule[],
  users: { id: number; name?: string }[],
): { userId: number; userName: string; entries: { dayOfWeek: number; timeRange: string }[] }[] {
  const byUser = new Map<number, GridSchedule[]>()
  for (const schedule of schedules) {
    const list = byUser.get(schedule.userId) ?? []
    list.push(schedule)
    byUser.set(schedule.userId, list)
  }

  return Array.from(byUser.entries())
    .map(([userId, userSchedules]) => ({
      userId,
      userName: users.find((user) => user.id === userId)?.name || "Usuário",
      entries: [...userSchedules]
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
        .map((schedule) => ({ dayOfWeek: schedule.dayOfWeek, timeRange: `${schedule.startTime}–${schedule.endTime}` })),
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName))
}
