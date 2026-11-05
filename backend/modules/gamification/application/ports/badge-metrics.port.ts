import type { MetricId } from "@/backend/domain"

/**
 * BadgeMetricsPort — plan-v15 S03 (MODELO R2). Valores medidos das métricas extras do
 * registro, por usuário. As métricas base (BASE_METRIC_IDS) continuam medidas pelas
 * portas da S01; esta porta é chamada só com as métricas que os criteria ativos pedem
 * (lazy por construção no EvaluateUserBadgesUseCase), então testes de unit sem criteria
 * v2 extra nunca chegam aqui.
 */
export interface BadgeMetricsPort {
  computeValues(userId: number, ids: MetricId[]): Promise<Partial<Record<MetricId, number>>>
}
