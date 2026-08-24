export const SLOT_MINUTES = 30
export const GRID_START = "07:00"
export const GRID_END = "21:00"

export const WEEK_DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]

export interface TimeSlot {
  start: string
  end: string
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

export function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, totalMinutes))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Generates contiguous [start, end) slots of `minutes` each. Last slot ends exactly at `end`. */
export function generateTimeSlots(start: string, end: string, minutes = SLOT_MINUTES): TimeSlot[] {
  const startMin = timeToMinutes(start)
  const endMin = timeToMinutes(end)
  if (minutes <= 0 || startMin >= endMin) return []

  const slots: TimeSlot[] = []
  let cursor = startMin
  while (cursor < endMin) {
    const slotEnd = Math.min(cursor + minutes, endMin)
    slots.push({ start: minutesToTime(cursor), end: minutesToTime(slotEnd) })
    cursor = slotEnd
  }
  return slots
}

export const TIME_SLOTS: TimeSlot[] = generateTimeSlots(GRID_START, GRID_END, SLOT_MINUTES)

/** Snaps an HH:mm time DOWN to the nearest multiple of `minutes` (idempotent). */
export function snapToSlot(time: string, minutes = SLOT_MINUTES): string {
  return minutesToTime(Math.floor(timeToMinutes(time) / minutes) * minutes)
}

export function snapRange(range: { startTime: string; endTime: string }, minutes = SLOT_MINUTES) {
  return { startTime: snapToSlot(range.startTime, minutes), endTime: snapToSlot(range.endTime, minutes) }
}
