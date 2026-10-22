import { closingMonthOfInstant, monthWindow, shouldSnapshotClosedMonth } from "@/backend/domain/gamification"
import { requireActorPermission } from "@/backend/domain/identity"
import type {
  MonthlyCloseOutcome,
  ResetMonthlyPointsCommand,
  ResetMonthlyPointsResult,
} from "@/backend/modules/gamification/application/contracts"
import type { MonthlyPointsCyclePort } from "@/backend/modules/gamification/application/ports/monthly-points-cycle.port"

/** Mesma frase do caminho semanal de horas: quem não é gestão não fecha mês de ninguém. */
export const MONTHLY_POINTS_RESET_DENIED_MESSAGE = "Apenas coordenadores e gerentes podem acessar."

/**
 * ResetMonthlyPointsUseCase — plan-v8 V8-2 (DEC-212). O fechamento do placar mensal: fotografa o
 * saldo e as tarefas do mês que fechou em `month_history` e zera `users.points`.
 *
 * As quatro coisas que este arquivo tem que fazer direito, cada uma com o motivo:
 *
 * 1. **Idempotência lida antes de zerar.** `hasMonthSnapshot` decide o "já fechou" e o use case
 *    então NÃO zera de novo — run repetida (redeploy, restart de container, disparo manual) não
 *    duplica linha e não apaga saldo do mês em curso. É a diferença deliberada com o semanal, cujo
 *    QUIRK-7C (sem dedup) está congelado em teste e NÃO é modelo aqui. A unique `(userId, month)`
 *    do schema é o backstop da corrida, devolvido como `false` pelo port.
 * 2. **Audiência ampla, não "ativos".** Quem está suspenso com saldo no fechamento fecha histórico;
 *    quem tem saldo 0 e nenhuma tarefa no mês não ganha linha (e a coluna dele já está em 0). O
 *    `findActiveUsers()` do semanal apagaria a primeira pessoa em silêncio.
 * 3. **O mês vem de `now` como parâmetro, pela aritmética de dia civil** (DEC-132): a run das
 *    00:00 de 1º de novembro fecha OUTUBRO, e a run vem depois do sweep das 23:59 do último dia,
 *    que já persistiu o que tinha a persistir (MODELO mensal §4: o mês de um prêmio é o mês do
 *    crédito, nunca o da conclusão).
 * 4. **Sem herdar o negativo.** O snapshot guarda −37.140 se foi o que houve (DEC-39 preservada no
 *    histórico); a coluna recebe 0 sempre. O mês perdoa, o histórico não apaga.
 *
 * O gate é o do precedente semanal (MANAGE_USERS com `systemActor` bypassando, DEC-54). Hoje o
 * único chamador é a rotina do cron — existe o caminho do painel de disparo manual no MODELO
 * (Q12) e ele já encontra o gate montado; nenhuma rota declara ator de sistema (a guarda
 * `system-actor.test.ts` falha o build se uma declarar).
 */
export class ResetMonthlyPointsUseCase {
  constructor(private readonly dependencies: { cycle: MonthlyPointsCyclePort }) {}

  async execute(command: ResetMonthlyPointsCommand): Promise<ResetMonthlyPointsResult> {
    requireActorPermission(command.actor, "MANAGE_USERS", MONTHLY_POINTS_RESET_DENIED_MESSAGE)

    const month = closingMonthOfInstant(command.now)
    const window = monthWindow(month)
    const candidates = await this.dependencies.cycle.listAllUsersForClose()

    const outcomes: MonthlyCloseOutcome[] = []
    let closed = 0
    let alreadyClosed = 0
    let skippedWithoutActivity = 0

    for (const candidate of candidates) {
      const completedTasksOfMonth = await this.dependencies.cycle.countTasksCompletedInMonth(
        candidate.userId,
        window,
      )

      // A leitura vem primeiro: é ela que diz "não zeramos de novo", e é ela que corta o trabalho
      // do port nas pessoas que já têm a linha do mês.
      if (await this.dependencies.cycle.hasMonthSnapshot(candidate.userId, month)) {
        alreadyClosed += 1
        outcomes.push({
          userId: candidate.userId,
          name: candidate.name,
          month,
          points: candidate.points,
          completedTasksOfMonth,
          status: "already-closed",
        })
        continue
      }

      if (!shouldSnapshotClosedMonth({ points: candidate.points, completedTasksOfMonth })) {
        skippedWithoutActivity += 1
        outcomes.push({
          userId: candidate.userId,
          name: candidate.name,
          month,
          points: candidate.points,
          completedTasksOfMonth,
          status: "without-activity",
        })
        continue
      }

      const written = await this.dependencies.cycle.closeMonth({
        userId: candidate.userId,
        month,
        points: candidate.points,
        completedTasksOfMonth,
      })

      if (!written) {
        alreadyClosed += 1
        outcomes.push({
          userId: candidate.userId,
          name: candidate.name,
          month,
          points: candidate.points,
          completedTasksOfMonth,
          status: "already-closed",
        })
        continue
      }

      closed += 1
      outcomes.push({
        userId: candidate.userId,
        name: candidate.name,
        month,
        points: candidate.points,
        completedTasksOfMonth,
        status: "closed",
      })
    }

    return { month, closed, alreadyClosed, skippedWithoutActivity, outcomes }
  }
}
