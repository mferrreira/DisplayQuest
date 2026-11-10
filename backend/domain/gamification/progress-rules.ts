import type { BadgeCriteriaV2, MetricId } from "./metric-registry"

/**
 * plan-v15 S10 (R7, CA4) — progresso "X de Y" de badge não conquistada.
 *
 * A cláusula mais distante é a de MENOR razão `value / target` — nunca a média. Métrica
 * sem valor medido não entra na conta (badge com criteria fora do registro não tem
 * progresso na tela). O X mostrado é o valor medido, cortado no target (7 de 10; quem
 * passou de 12 de 10 é conquistada, não progresso).
 */
export interface BadgeProgress {
  value: number
  target: number
  metric: MetricId
}

export function badgeProgressFor(
  values: Partial<Record<MetricId, number>>,
  criteria: BadgeCriteriaV2,
): BadgeProgress | null {
  let best: BadgeProgress | null = null
  let bestRatio = Infinity

  for (const clause of criteria.clauses) {
    const target = clause.value
    if (!Number.isInteger(target) || target < 1) continue
    const measured = values[clause.metric as MetricId]
    if (typeof measured !== "number") continue
    const ratio = measured / target
    if (ratio < bestRatio) {
      bestRatio = ratio
      best = { value: Math.min(measured, target), target, metric: clause.metric as MetricId }
    }
  }

  return best
}

/** Rótulo da tela: "7 de 10". Só value/target importam — a tela não sabe nem precisa saber a métrica. */
export function progressLabel(progress: { value: number; target: number }): string {
  return `${progress.value} de ${progress.target}`
}
