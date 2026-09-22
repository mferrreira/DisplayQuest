/**
 * Helpers de exibição para relatórios (relatório semanal por pessoa e relatório de projeto).
 * Modos: grouped (agrupado por projeto / por pessoa, A→Z), chronological (por horário asc)
 * e original (ordem como veio da API). Funções puras, unitáveis (padrão lib/reports/csv-utils).
 */

export type ReportDisplayMode = "grouped" | "chronological" | "original"

export interface ReportGroupSection<T> {
  key: string
  label: string
  items: T[]
}

type IsoOrDate = string | Date | null | undefined

interface TimeOrderable {
  startTime?: IsoOrDate
  endTime?: IsoOrDate
  date?: IsoOrDate
}

interface ProjectGroupable extends TimeOrderable {
  project?: { name?: string | null } | null
}

interface PersonGroupable extends TimeOrderable {
  userName?: string | null
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" })

function toTimeSeconds(item: TimeOrderable): number {
  const raw = item.startTime || item.date
  if (!raw) return Number.MAX_SAFE_INTEGER
  const t = new Date(raw).getTime()
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t
}

export function sortByTimeAsc<T extends TimeOrderable>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const byTime = toTimeSeconds(a) - toTimeSeconds(b)
    if (byTime !== 0) return byTime
    const aHas = a.startTime || a.date ? 1 : 0
    const bHas = b.startTime || b.date ? 1 : 0
    return bHas - aHas
  })
}

function buildFlat<T extends TimeOrderable>(items: T[], mode: ReportDisplayMode): ReportGroupSection<T>[] {
  return [{ key: "all", label: "", items: mode === "chronological" ? sortByTimeAsc(items) : [...items] }]
}

/** Agrupa logs do relatório semanal por pessoa por projeto (A→Z; sem projeto no fim). */
export function groupLogsByProject<T extends ProjectGroupable>(
  logs: T[],
  mode: ReportDisplayMode,
): ReportGroupSection<T>[] {
  if (mode !== "grouped") return buildFlat(logs, mode)

  const map = new Map<string, T[]>()
  const order: string[] = []
  const unassigned: T[] = []

  for (const log of logs) {
    const name = log.project?.name
    if (name) {
      if (map.has(name)) map.get(name)!.push(log)
      else {
        map.set(name, [log])
        order.push(name)
      }
    } else {
      unassigned.push(log)
    }
  }

  const sections = [...order].sort((a, b) => collator.compare(a, b)).map((name) => ({
    key: `project:${name}`,
    label: name,
    items: sortByTimeAsc(map.get(name)!),
  }))

  if (unassigned.length > 0) {
    sections.push({ key: "project:unassigned", label: "Sem projeto", items: sortByTimeAsc(unassigned) })
  }
  return sections
}

/** Agrupa sessões/logs do relatório de projeto por pessoa (A→Z; sem responsável no fim). */
export function groupByPerson<T extends PersonGroupable>(
  items: T[],
  mode: ReportDisplayMode,
): ReportGroupSection<T>[] {
  if (mode !== "grouped") return buildFlat(items, mode)

  const map = new Map<string, T[]>()
  const order: string[] = []
  const unassigned: T[] = []

  for (const item of items) {
    const name = item.userName
    if (name) {
      if (map.has(name)) map.get(name)!.push(item)
      else {
        map.set(name, [item])
        order.push(name)
      }
    } else {
      unassigned.push(item)
    }
  }

  const sections = [...order].sort((a, b) => collator.compare(a, b)).map((name) => ({
    key: `person:${name}`,
    label: name,
    items: sortByTimeAsc(map.get(name)!),
  }))

  if (unassigned.length > 0) {
    sections.push({ key: "person:unassigned", label: "Sem responsável", items: sortByTimeAsc(unassigned) })
  }
  return sections
}