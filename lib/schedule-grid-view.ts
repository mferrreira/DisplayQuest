import { TIME_SLOTS, timeToMinutes } from "@/lib/constants/schedule-grid"

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
 * Célula de um slot da grade. Três estados:
 *  - `start`: um bloco começa aqui. `blocks` lista os blocos (mais de um só na
 *    sobreposição rara) e `rowSpan` diz quantos slots o maior deles cobre.
 *  - `covered`: o slot é continuação de um bloco começado antes. A linha não
 *    renderiza `<td>` para este dia, porque o rowSpan do bloco já o ocupa.
 *  - `empty`: slot livre.
 */
export type GridSlotCell =
  | { kind: "start"; blocks: { schedule: GridSchedule; rowSpan: number }[]; rowSpan: number }
  | { kind: "covered" }
  | { kind: "empty" }

/**
 * Monta as colunas da grade: uma matriz `[dia][slot]`.
 *
 * Antes disto, cada slot renderizava uma cópia de cada bloco que o cruzava: um
 * horário das 09:00 às 12:00 aparecia seis vezes, uma por linha de 30 minutos, e
 * a tabela crescia sem parar. Medido na instância em 2026-10-09: 19 linhas,
 * 1561 px de altura, com linhas de 99 px feitas de fichas repetidas, e 1944 px
 * quando a janela estreitava. Agora o bloco é uma célula só, com rowSpan sobre
 * os slots que cobre, e a altura da tabela para de crescer com a quantidade de
 * fichas.
 *
 * Blocos que não cruzam nenhum slot visível (fora da janela) são ignorados, e
 * são recortados nos limites da janela: um bloco 09:10–12:05 ocupa do slot
 * 09:00 ao slot 12:00.
 */
export function buildScheduleColumns(
  schedules: GridSchedule[],
  slots: { start: string; end: string }[],
  dayCount: number,
): GridSlotCell[][] {
  const columns: GridSlotCell[][] = Array.from({ length: dayCount }, () =>
    slots.map((): GridSlotCell => ({ kind: "empty" })),
  )
  if (slots.length === 0) return columns

  for (const schedule of schedules) {
    if (schedule.dayOfWeek < 0 || schedule.dayOfWeek >= dayCount) continue
    const startMin = timeToMinutes(schedule.startTime)
    const endMin = timeToMinutes(schedule.endTime)
    if (endMin <= startMin) continue

    const firstIdx = slots.findIndex((slot) => timeToMinutes(slot.end) > startMin)
    if (firstIdx === -1) continue

    let lastIdx = -1
    for (let i = slots.length - 1; i >= firstIdx; i--) {
      if (timeToMinutes(slots[i].start) < endMin) {
        lastIdx = i
        break
      }
    }
    if (lastIdx < firstIdx) continue

    const rowSpan = lastIdx - firstIdx + 1
    const column = columns[schedule.dayOfWeek]
    const target = column[firstIdx]

    if (target.kind === "empty") {
      column[firstIdx] = { kind: "start", blocks: [{ schedule, rowSpan }], rowSpan }
      for (let i = firstIdx + 1; i <= lastIdx; i++) column[i] = { kind: "covered" }
      continue
    }

    if (target.kind === "start") {
      // Dois blocos começando no mesmo slot: empilham na mesma célula. O rowSpan
      // da célula é o maior dos blocos, então o mais curto é visualmente longo
      // demais, mas o rótulo dele mostra o intervalo real.
      target.blocks.push({ schedule, rowSpan })
      target.rowSpan = Math.max(target.rowSpan, rowSpan)
      continue
    }

    // `covered`: o bloco começa no meio de outro. Sem celula propria possivel
    // (rowSpan nao divide linha), entao ele e empilhado na celula que comecou
    // antes, mantendo o comportamento antigo de fichas somadas.
    const host = findStartCell(column, firstIdx)
    if (host) {
      host.blocks.push({ schedule, rowSpan: 1 })
      host.rowSpan = Math.max(host.rowSpan, 1)
    }
  }

  return columns
}

function findStartCell(column: GridSlotCell[], fromIdx: number) {
  for (let i = fromIdx; i >= 0; i--) {
    const cell = column[i]
    if (cell.kind === "start") return cell
  }
  return null
}

/**
 * Filtra horários pelos membros selecionados na grade. Com a seleção vazia,
 * retorna todos os horários (comportamento padrão).
 */
export function filterSchedulesByMemberIds(
  schedules: GridSchedule[],
  selectedIds: Set<number>,
): GridSchedule[] {
  if (selectedIds.size === 0) return schedules
  return schedules.filter((s) => selectedIds.has(s.userId))
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
