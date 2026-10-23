import {
  NotFoundError,
  averageWeeklyHoursFrom,
  DEFAULT_TROPHY_CRITERION_WINDOW,
  currentMonthOfInstant,
  currentSeasonYearOfInstant,
  maxConsecutiveDaysFrom,
  monthWindow,
  isTrophyCriterionWindow,
  trophyFactReadsFor,
  selectBadgesToAward,
  type TrophyCriterionWindow,
  type TrophyFacts,
} from "@/backend/domain"
import type { Badge } from "@/backend/domain"
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port"
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port"
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port"
import type { UserStatsPort } from "@/backend/modules/gamification/application/ports/user-stats.port"

/**
 * EvaluateUserBadgesUseCase — OND6-B2 (R2). Congelado do golden OND6-B1
 * (BadgeRulesEngine.evaluateUserForBadges + getUserStatistics):
 *   - so badges ATIVOS sao avaliados;
 *   - badges ja conquistados sao pulados;
 *   - stats agregados pelas regras puras (media das 4 semanas mais novas, streak max);
 *   - falha de concessao continua engolida com console.error (padrao da casa).
 *
 * DIVERGENCIA DOCUMENTADA (QUIRK-6A corrigido na impl nova): o caminho legado passava
 * objeto plain para UserBadgeRepository.create -> .toPrisma() TypeError -> badge
 * automatico NUNCA era concedido. Aqui o port recebe o DADO e a concessao FUNCIONA.
 * A divergencia e pinada explicitamente no contract suite (OND6-B3) e submetida ao dono.
 *
 * plan-v8 V8-6 (DEC-219) muda o que o use case monta, não a máquina dele:
 *
 * 1. **Fatos por janela.** O motor passou a avaliar cada troféu com as métricas da SUA janela
 *    (`mes` / `temporada` / `vida`), então o use case reúne os Fatos (`TrophyFacts`) e a regra pura
 *    resolve qual métrica serve qual critério. Antes havia um `stats` único, e era exatamente isso
 *    que fazia um critério de "mês" medir a vida inteira.
 * 2. **O mês em curso não tem snapshot.** `month_history` só é escrito no fechamento (V8-2), e a
 *    janela `mes` mede o agora: as tarefas do mês em curso saem das DUAS famílias que creditam
 *    `completedTasks` (`UserStatsPort.countTasksCompletedSince`, mesmas condições do fechamento
 *    mensal e da revisão semanal de XP), e o placar do mês em curso é a própria coluna `users.points`
 *    — que o fechamento zera. Um critério de mês lido do snapshot estaria sempre um mês atrasado.
 * 3. **A temporada é o livro fechado + o mês vivo.** Soma de `month_history` do ano MAIS o placar do
 *    mês em curso; o XP é a coluna (DEC-214). É a mesma conta que a escada de elo faz, e por isso o
 *    critério `xp` da temporada e o elo da temporada não podem divergir.
 * 4. **`now` entra por parâmetro com default no application layer.** Nenhuma regra de domínio lê
 *    relógio (RG-01); o instantâneo do "agora" é decisão de quem chama, e o default é o
 *    `new Date()` do chamador de premiação — o mesmo padrão medido em `complete-task.use-case.ts`.
 *    Chamar com um `now` explícito é o que faz o teste do critério de mês não depender do calendário
 *    do laboratório.
 */

export interface EvaluateUserBadgesDependencies {
  users: GamificationUsersPort
  badges: BadgeCatalogPort
  userBadges: UserBadgePort
  stats: UserStatsPort
}

export class EvaluateUserBadgesUseCase {
  constructor(private readonly dependencies: EvaluateUserBadgesDependencies) {}

  async execute(userId: number, now: Date = new Date()): Promise<Badge[]> {
    const user = await this.dependencies.users.findUserById(userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    const activeBadges = await this.dependencies.badges.findActive()
    if (activeBadges.length === 0) {
      return []
    }

    const earned = await this.dependencies.userBadges.findByUserId(userId)
    const earnedBadgeIds = earned.map((ub) => ub.badgeId)
    const windows = new Set<TrophyCriterionWindow>(
      activeBadges.map((badge) => {
        const window = badge.criteria?.window
        return isTrophyCriterionWindow(window) ? window : DEFAULT_TROPHY_CRITERION_WINDOW
      }),
    )

    const reads = trophyFactReadsFor(windows)
    const month = currentMonthOfInstant(now)
    const seasonYear = currentSeasonYearOfInstant(now)

    const [
      projectsCount,
      workSessionsCount,
      weeklySamples,
      dailyDates,
      allUsers,
      monthTasks,
      closedSeason,
    ] = await Promise.all([
      this.dependencies.stats.projectsCount(userId),
      this.dependencies.stats.workSessionsCount(userId),
      this.dependencies.stats.weeklyHoursSamples(userId),
      this.dependencies.stats.dailyLogDates(userId),
      this.dependencies.users.findAllUsers(),
      // Só as janelas que algum troféu ativo pede. Um catálogo inteiro de `vida` não paga query de
      // mês: as leituras novas são caras e o catálogo existente não usa `mes`.
      // Só as janelas que algum troféu ativo pede: quem decide é o domínio (`trophyFactReadsFor`),
      // não um token escrito aqui. Um catálogo inteiro de `vida` não paga query de mês nem de ano.
      reads.needsMonthTasks
        ? this.dependencies.stats.countTasksCompletedSince(userId, monthWindow(month))
        : 0,
      reads.needsClosedSeason
        ? this.dependencies.stats.closedSeasonSums(userId, seasonYear)
        : { points: 0, completedTasks: 0 },
    ])

    const facts: TrophyFacts = {
      monthPoints: user.points,
      monthTasks,
      seasonXp: user.xp,
      closedSeasonPoints: closedSeason.points,
      closedSeasonTasks: closedSeason.completedTasks,
      lifetimeTasks: user.completedTasks,
      coins: user.coins,
      workSessionsCount,
      projectsCount,
      averageWeeklyHours: averageWeeklyHoursFrom(weeklySamples),
      maxConsecutiveDays: maxConsecutiveDaysFrom(dailyDates),
    }

    const toAward = selectBadgesToAward({
      badges: activeBadges,
      earnedBadgeIds,
      userId: user.id,
      facts,
      roles: user.roles,
      weekHours: user.weekHours,
      allUsers,
    })

    const awarded: Badge[] = []
    for (const badge of toAward) {
      try {
        await this.dependencies.userBadges.create({
          userId: user.id,
          badgeId: badge.id!,
          earnedBy: null,
        })
        awarded.push(badge)
      } catch (error) {
        console.error(`Error awarding badge ${badge.id} to user ${user.id}:`, error)
      }
    }

    return awarded
  }
}

