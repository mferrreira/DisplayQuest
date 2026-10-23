import {
  netXpAdjustment,
  weeklyXpAdjustments,
  weeklyXpReviewDescription,
  xpClosedWeekOfInstant,
  xpWeekWindow,
} from "@/backend/domain/gamification";
import { requireActorPermission } from "@/backend/domain/identity";
import type { ActorRef } from "@/backend/domain/identity";
import type {
  ReviewWeeklyXpResult,
  WeeklyXpReviewOutcome,
} from "@/backend/modules/gamification/application/contracts";
import type { WeeklyXpReviewPort } from "@/backend/modules/gamification/application/ports/weekly-xp-review.port";

/** Mesma frase dos dois caminhos de reset (horas semanal e placar mensal): gestão fecha período. */
export const WEEKLY_XP_REVIEW_DENIED_MESSAGE = "Apenas coordenadores e gerentes podem acessar.";

/**
 * ReviewWeeklyXpUseCase — plan-v8 V8-3 (DEC-214). A revisão semanal da trilha XP: boosts de
 * constância e de produtividade, penalidades de atraso e de meta, com piso 0 por pessoa.
 *
 * As quatro coisas que este arquivo tem que fazer direito, cada uma com o motivo:
 *
 * 1. **A semana é a que FECHOU, pela aritmética de dia civil** (DEC-132): o job roda segunda às
 *    00:10 e fecha a segunda–domingo anterior. A janela tem corte de fim exclusivo — o instante das
 *    00:00 da segunda nova é da semana nova, e nenhum instante fica fora das duas.
 * 2. **Toda a aritmética é do domínio** (`xp-rules.ts`): o boost de 10+ substituindo o de 5+, a
 *    substituição, as penalidades por unidade, o piso. A port entrega contagem; este arquivo decide
 *    e devolve o que decidiu, item a item, para o ledger registrar a decisão e não só o resultado.
 * 3. **Idempotência por `(userId, weekStart)`**: a linha de revisão existe no ledger com a chave
 *    `GAMIFICATION:XP:WEEKLY_REVIEW:<userId>:<weekStart>`; ela é lida antes de escrever (a escrita
 *    nunca vem atrás de uma dedup não lida) e o adaptador reconfere dentro da transação. Segunda
 *    run da mesma semana não soma boost nenhum de novo.
 * 4. **Sem ajuste, sem linha**: uma semana que não produz boost nem penalidade não escreve ledger
 *    com zeros. Reavaliar uma semana sem acontecimento é barato e não muda nada; poluir o
 *    livro-caixa com `0` é o que depois alguém lê como "revisado".
 *
 * O gate é o dos dois resets anteriores (MANAGE_USERS, com `systemActor` bypassando — DEC-54). Hoje
 * o único chamador é a rotina do cron; nenhuma rota declara ator de sistema (a guarda
 * `system-actor.test.ts` falha o build se uma declarar).
 */
export class ReviewWeeklyXpUseCase {
  constructor(private readonly dependencies: { weeklyXp: WeeklyXpReviewPort }) {}

  async execute(command: { actor: ActorRef; now: Date }): Promise<ReviewWeeklyXpResult> {
    requireActorPermission(command.actor, "MANAGE_USERS", WEEKLY_XP_REVIEW_DENIED_MESSAGE);

    const weekStart = xpClosedWeekOfInstant(command.now);
    const window = xpWeekWindow(weekStart);
    const candidates = await this.dependencies.weeklyXp.listUsersForWeeklyReview();

    const outcomes: WeeklyXpReviewOutcome[] = [];
    let adjusted = 0;
    let alreadyReviewed = 0;
    let withoutAdjustment = 0;

    for (const candidate of candidates) {
      const description = weeklyXpReviewDescription(candidate.userId, weekStart);

      if (await this.dependencies.weeklyXp.hasWeeklyReview(candidate.userId, weekStart)) {
        alreadyReviewed += 1;
        outcomes.push({
          userId: candidate.userId,
          name: candidate.name,
          weekStart,
          status: "already-reviewed",
          adjustments: [],
          netAmount: 0,
          xpBefore: candidate.xp,
          xpAfter: candidate.xp,
        });
        continue;
      }

      const facts = await this.dependencies.weeklyXp.getWeeklyFacts(candidate.userId, window);
      const adjustments = weeklyXpAdjustments({ ...facts, weekHoursGoal: candidate.weekHoursGoal });

      if (adjustments.length === 0) {
        withoutAdjustment += 1;
        outcomes.push({
          userId: candidate.userId,
          name: candidate.name,
          weekStart,
          status: "without-adjustment",
          adjustments: [],
          netAmount: 0,
          xpBefore: candidate.xp,
          xpAfter: candidate.xp,
        });
        continue;
      }

      const netAmount = netXpAdjustment(adjustments);
      const applied = await this.dependencies.weeklyXp.applyWeeklyXpAdjustment({
        userId: candidate.userId,
        weekStart,
        description,
        adjustments,
        netAmount,
      });

      if (!applied.applied) {
        alreadyReviewed += 1;
        outcomes.push({
          userId: candidate.userId,
          name: candidate.name,
          weekStart,
          status: "already-reviewed",
          adjustments: [],
          netAmount: 0,
          xpBefore: candidate.xp,
          xpAfter: candidate.xp,
        });
        continue;
      }

      adjusted += 1;
      outcomes.push({
        userId: candidate.userId,
        name: candidate.name,
        weekStart,
        status: "adjusted",
        adjustments,
        netAmount,
        xpBefore: applied.xpBefore,
        xpAfter: applied.xpAfter,
      });
    }

    return { weekStart, adjusted, alreadyReviewed, withoutAdjustment, outcomes };
  }
}
