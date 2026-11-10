import { civilDayOfInstant } from "@/backend/domain"
import type { Task } from "@/entities/task"

export interface WeeklyBucket {
  weekStart: string
  weekEnd: string
  label: string
  count: number
}

/**
 * Ritmo de conclusões nos últimos 7 dias civis (o gráfico "Atividade da semana", dono 2026-10-22).
 * A chave de hoje vem de `civilDayOfInstant` (fuso do laboratório) e os dias anteriores saem por
 * subtração de calendário em UTC — a mesma noção de dia civil, sem `new Date()` solto na aritmética
 * (DEC-132). Conclusão de SUBTASK conta tanto quanto a da tarefa: uma mãe pode ter 50 subtasks e o
 * ritmo não pode dizer "1" para elas. `tasks` é o que a pessoa enxerga no quadro (recorte filtrado).
 */
export function weeklyConclusionBuckets(tasks: Task[], today: string): WeeklyBucket[] {
  const todayInstant = Date.parse(`${today}T12:00:00Z`)
  const buckets: WeeklyBucket[] = []
  for (let i = 6; i >= 0; i--) {
    const day = new Date(todayInstant - i * 86_400_000)
    const key = civilDayOfInstant(day)
    const dayNumber = Number(key.slice(8, 10))
    const dayMonth = Number(key.slice(5, 7))
    const label = `${String(dayNumber).padStart(2, "0")}/${String(dayMonth).padStart(2, "0")}`
    const count = tasks.reduce((total, task) => {
      let n = task.completedAt && civilDayOfInstant(new Date(task.completedAt)) === key ? 1 : 0
      for (const subtask of task.subtasks ?? []) {
        if (subtask.completedAt && civilDayOfInstant(new Date(subtask.completedAt)) === key) n += 1
      }
      return total + n
    }, 0)
    buckets.push({ weekStart: key, weekEnd: key, label, count })
  }
  return buckets
}
