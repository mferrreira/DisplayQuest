"use client"

import { Progress } from "@/components/ui/progress"
import { civilDayOfInstant, projectTimeProgress } from "@/backend/domain"

/**
 * ProjectTimeProgress — o andamento temporal do projeto (V5-11, DEC-63/132).
 *
 * O gráfico que o dono pediu é `data_final − dia_de_hoje`: a barra mostra o tempo do
 * período já decorrido e a linha nomeia os dias que faltam. A ARITMÉTICA é a regra pura
 * do domínio (`projectTimeProgress`, dia civil — DEC-132); a tela não soma dias nem
 * inventa percentual (lição DEC-96: a tela fala o vocabulário da regra, não o próprio).
 *
 * Sem data de término não há andamento a desenhar e o componente não renderiza nada —
 * o projeto pode não ter período. `projects.points` já tem exibição própria no diálogo
 * (DEC-63): aqui é só o relógio do calendário.
 */
export function ProjectTimeProgress({
  startDate,
  endDate,
  className,
}: {
  startDate?: string | null
  endDate?: string | null
  className?: string
}) {
  const progress = projectTimeProgress({ startDate, endDate }, civilDayOfInstant(new Date()))

  if (progress.state === "sem_datas") return null

  let label: string
  if (progress.state === "antes_do_inicio") {
    label = `Começa em ${progress.daysUntilStart} ${progress.daysUntilStart === 1 ? "dia" : "dias"} — término em ${progress.remainingDays} ${progress.remainingDays === 1 ? "dia" : "dias"}`
  } else if (progress.state === "encerrado") {
    label = `Encerrado há ${progress.daysSinceEnd} ${progress.daysSinceEnd === 1 ? "dia" : "dias"}`
  } else {
    const remaining = `Faltam ${progress.remainingDays} ${progress.remainingDays === 1 ? "dia" : "dias"} para o término`
    label =
      progress.elapsedDays !== null && progress.totalDays !== null
        ? `${remaining} — ${progress.elapsedDays} de ${progress.totalDays} dias decorridos`
        : remaining
  }

  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <dt className="text-sm text-muted-foreground">Andamento</dt>
      <dd>
        <Progress value={progress.percent} className="h-2" aria-label={`Andamento do projeto: ${progress.percent}% do período decorrido`} />
        <p className="mt-1 text-sm">{label}</p>
      </dd>
    </div>
  )
}
