import { AwardFromTaskCompletionUseCase } from "@/backend/modules/gamification/application/use-cases/award-from-task-completion.use-case"
import { AwardFromActivityCompletionUseCase } from "@/backend/modules/gamification/application/use-cases/award-from-activity-completion.use-case"
import { AwardFromWorkSessionUseCase } from "@/backend/modules/gamification/application/use-cases/award-from-work-session.use-case"
import { AssertCanManageUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/assert-can-manage-user-badges.use-case"
import { CloseSeasonUseCase } from "@/backend/modules/gamification/application/use-cases/close-season.use-case"
import { EvaluateUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case"
import { GetUserProgressionUseCase } from "@/backend/modules/gamification/application/use-cases/get-user-progression.use-case"
import { ReadUserProgressionUseCase } from "@/backend/modules/gamification/application/use-cases/read-user-progression.use-case"
import { ResetMonthlyPointsUseCase } from "@/backend/modules/gamification/application/use-cases/reset-monthly-points.use-case"
import { ReviewWeeklyXpUseCase } from "@/backend/modules/gamification/application/use-cases/review-weekly-xp.use-case"
import {
  AwardBadgeUseCase,
  CreateBadgeUseCase,
  DeleteBadgeUseCase,
  GetBadgeByIdUseCase,
  ListBadgesUseCase,
  ListRecentUserBadgesUseCase,
  ListUserBadgesUseCase,
  RemoveUserBadgeUseCase,
  UpdateBadgeUseCase,
} from "@/backend/modules/gamification/application/use-cases/badge-management.use-cases"
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port"
import type { GamificationAwardHistoryPort } from "@/backend/modules/gamification/application/ports/gamification-award-history.port"
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port"
import type { MonthlyPointsCyclePort } from "@/backend/modules/gamification/application/ports/monthly-points-cycle.port"
import type { SeasonChampionPort } from "@/backend/modules/gamification/application/ports/season-champion.port"
import type { SeasonCyclePort } from "@/backend/modules/gamification/application/ports/season-cycle.port"
import type { WeeklyXpReviewPort } from "@/backend/modules/gamification/application/ports/weekly-xp-review.port"
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port"
import type { UserStatsPort } from "@/backend/modules/gamification/application/ports/user-stats.port"
import { createPrismaBadgeCatalogPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-badge-catalog.port"
import { createPrismaGamificationAwardHistoryPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-gamification-award-history.port"
import { createPrismaGamificationUsersPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-gamification-users.port"
import { createPrismaMonthlyPointsCyclePort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-monthly-points-cycle.port"
import { createPrismaSeasonChampionPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-season-champion.port"
import { createPrismaSeasonCyclePort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-season-cycle.port"
import { createPrismaWeeklyXpReviewPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-weekly-xp-review.port"
import { createPrismaUserBadgePort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-user-badge.port"
import { createPrismaUserStatsPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-user-stats.port"

/**
 * GamificationModule — OND6-B2 (R1/R2). Os use cases DETEM as regras (congeladas pelo
 * golden OND6-B1) sobre portas finas; a superficie publica para rotas/publishers e
 * INALTERADA (mesodos nomes e assinaturas — GamificationAwardsPort/TaskAwardPort dos
 * publishers continuam casando estruturalmente, DEC-21).
 *
 * O `PrismaGamificationGateway` legado e os engines antigos FORAM REMOVIDOS em OND9-B1
 * (repo-cleanup B8, 2026-10-01) junto com o contract suite — o comportamento antigo fica
 * preservado no git (tag `pre-cleanup`).
 */

type UseCaseExecute<T> = T extends { execute: (...args: infer A) => infer R } ? (...args: A) => R : never

export class GamificationModule {
  readonly awardFromWorkSession: UseCaseExecute<AwardFromWorkSessionUseCase>
  readonly awardFromTaskCompletion: UseCaseExecute<AwardFromTaskCompletionUseCase>
  /** V5-7b (DEC-63/104): o crédito da parcela de prêmio de atividade aprovada. */
  readonly awardFromActivityCompletion: UseCaseExecute<AwardFromActivityCompletionUseCase>
  readonly getUserProgression: UseCaseExecute<GetUserProgressionUseCase>
  readonly evaluateUserBadges: UseCaseExecute<EvaluateUserBadgesUseCase>
  readonly listBadges: UseCaseExecute<ListBadgesUseCase>
  readonly getBadgeById: UseCaseExecute<GetBadgeByIdUseCase>
  readonly createBadge: UseCaseExecute<CreateBadgeUseCase>
  readonly updateBadge: UseCaseExecute<UpdateBadgeUseCase>
  readonly deleteBadge: UseCaseExecute<DeleteBadgeUseCase>
  readonly listUserBadges: UseCaseExecute<ListUserBadgesUseCase>
  readonly listRecentUserBadges: UseCaseExecute<ListRecentUserBadgesUseCase>
  readonly awardBadge: UseCaseExecute<AwardBadgeUseCase>
  readonly removeUserBadge: UseCaseExecute<RemoveUserBadgeUseCase>
  /** D4/B6-2c: o gate que a rota chama ANTES de ler corpo/params (ordem congelada em teste). */
  readonly assertCanManageUserBadges: UseCaseExecute<AssertCanManageUserBadgesUseCase>
  /** D4/B6-2c: self-or-manage sobre a progressão; o lookup sem ator continua em `getUserProgression`. */
  readonly readUserProgression: UseCaseExecute<ReadUserProgressionUseCase>
  /** plan-v8 V8-2 (DEC-212): fechamento mensal do placar — chamada só pela rotina do cron, sem rota. */
  readonly resetMonthlyPoints: UseCaseExecute<ResetMonthlyPointsUseCase>
  /** plan-v8 V8-3 (DEC-214): revisao semanal de XP — chamada só pela rotina do cron, sem rota. */
  readonly reviewWeeklyXp: UseCaseExecute<ReviewWeeklyXpUseCase>
  /** plan-v8 V8-4 (DEC-213): fechamento da temporada anual — chamado só pela rotina do cron, sem rota. */
  readonly closeSeason: UseCaseExecute<CloseSeasonUseCase>

  constructor(
    private readonly awardFromWorkSessionUseCase: AwardFromWorkSessionUseCase,
    private readonly awardFromTaskCompletionUseCase: AwardFromTaskCompletionUseCase,
    private readonly awardFromActivityCompletionUseCase: AwardFromActivityCompletionUseCase,
    private readonly getUserProgressionUseCase: GetUserProgressionUseCase,
    private readonly evaluateUserBadgesUseCase: EvaluateUserBadgesUseCase,
    private readonly listBadgesUseCase: ListBadgesUseCase,
    private readonly getBadgeByIdUseCase: GetBadgeByIdUseCase,
    private readonly createBadgeUseCase: CreateBadgeUseCase,
    private readonly updateBadgeUseCase: UpdateBadgeUseCase,
    private readonly deleteBadgeUseCase: DeleteBadgeUseCase,
    private readonly listUserBadgesUseCase: ListUserBadgesUseCase,
    private readonly listRecentUserBadgesUseCase: ListRecentUserBadgesUseCase,
    private readonly awardBadgeUseCase: AwardBadgeUseCase,
    private readonly removeUserBadgeUseCase: RemoveUserBadgeUseCase,
    private readonly assertCanManageUserBadgesUseCase: AssertCanManageUserBadgesUseCase,
    private readonly readUserProgressionUseCase: ReadUserProgressionUseCase,
    private readonly resetMonthlyPointsUseCase: ResetMonthlyPointsUseCase,
    private readonly reviewWeeklyXpUseCase: ReviewWeeklyXpUseCase,
    private readonly closeSeasonUseCase: CloseSeasonUseCase,
  ) {
    this.awardFromWorkSession = this.awardFromWorkSessionUseCase.execute.bind(this.awardFromWorkSessionUseCase)
    this.awardFromTaskCompletion = this.awardFromTaskCompletionUseCase.execute.bind(this.awardFromTaskCompletionUseCase)
    this.awardFromActivityCompletion = this.awardFromActivityCompletionUseCase.execute.bind(this.awardFromActivityCompletionUseCase)
    this.getUserProgression = this.getUserProgressionUseCase.execute.bind(this.getUserProgressionUseCase)
    this.evaluateUserBadges = this.evaluateUserBadgesUseCase.execute.bind(this.evaluateUserBadgesUseCase)
    this.listBadges = this.listBadgesUseCase.execute.bind(this.listBadgesUseCase)
    this.getBadgeById = this.getBadgeByIdUseCase.execute.bind(this.getBadgeByIdUseCase)
    this.createBadge = this.createBadgeUseCase.execute.bind(this.createBadgeUseCase)
    this.updateBadge = this.updateBadgeUseCase.execute.bind(this.updateBadgeUseCase)
    this.deleteBadge = this.deleteBadgeUseCase.execute.bind(this.deleteBadgeUseCase)
    this.listUserBadges = this.listUserBadgesUseCase.execute.bind(this.listUserBadgesUseCase)
    this.listRecentUserBadges = this.listRecentUserBadgesUseCase.execute.bind(this.listRecentUserBadgesUseCase)
    this.awardBadge = this.awardBadgeUseCase.execute.bind(this.awardBadgeUseCase)
    this.removeUserBadge = this.removeUserBadgeUseCase.execute.bind(this.removeUserBadgeUseCase)
    this.assertCanManageUserBadges = this.assertCanManageUserBadgesUseCase.execute.bind(this.assertCanManageUserBadgesUseCase)
    this.readUserProgression = this.readUserProgressionUseCase.execute.bind(this.readUserProgressionUseCase)
    this.resetMonthlyPoints = this.resetMonthlyPointsUseCase.execute.bind(this.resetMonthlyPointsUseCase)
    this.reviewWeeklyXp = this.reviewWeeklyXpUseCase.execute.bind(this.reviewWeeklyXpUseCase)
    this.closeSeason = this.closeSeasonUseCase.execute.bind(this.closeSeasonUseCase)
  }
}

export interface GamificationModulePorts {
  users: GamificationUsersPort
  awardHistory: GamificationAwardHistoryPort
  badges: BadgeCatalogPort
  userBadges: UserBadgePort
  stats: UserStatsPort
  monthlyCycle: MonthlyPointsCyclePort
  weeklyXp: WeeklyXpReviewPort
  seasonCycle: SeasonCyclePort
  seasonChampion: SeasonChampionPort
}

export interface GamificationModuleFactoryOptions {
  ports?: Partial<GamificationModulePorts>
}

export function createGamificationModule(options: GamificationModuleFactoryOptions = {}) {
  const ports: GamificationModulePorts = {
    users: options.ports?.users ?? createPrismaGamificationUsersPort(),
    awardHistory: options.ports?.awardHistory ?? createPrismaGamificationAwardHistoryPort(),
    badges: options.ports?.badges ?? createPrismaBadgeCatalogPort(),
    userBadges: options.ports?.userBadges ?? createPrismaUserBadgePort(),
    stats: options.ports?.stats ?? createPrismaUserStatsPort(),
    monthlyCycle: options.ports?.monthlyCycle ?? createPrismaMonthlyPointsCyclePort(),
    weeklyXp: options.ports?.weeklyXp ?? createPrismaWeeklyXpReviewPort(),
    seasonCycle: options.ports?.seasonCycle ?? createPrismaSeasonCyclePort(),
    seasonChampion: options.ports?.seasonChampion ?? createPrismaSeasonChampionPort(),
  }

  const progression = new GetUserProgressionUseCase({ users: ports.users })
  const evaluateUserBadges = new EvaluateUserBadgesUseCase({
    users: ports.users,
    badges: ports.badges,
    userBadges: ports.userBadges,
    stats: ports.stats,
  })

  return new GamificationModule(
    new AwardFromWorkSessionUseCase({
      awardHistory: ports.awardHistory,
      progression,
      evaluateUserBadges,
    }),
    new AwardFromTaskCompletionUseCase({
      awardHistory: ports.awardHistory,
      progression,
      evaluateUserBadges,
    }),
    new AwardFromActivityCompletionUseCase({
      awardHistory: ports.awardHistory,
      progression,
      evaluateUserBadges,
    }),
    progression,
    evaluateUserBadges,
    new ListBadgesUseCase(ports.badges),
    new GetBadgeByIdUseCase(ports.badges),
    new CreateBadgeUseCase(ports.badges),
    new UpdateBadgeUseCase(ports.badges),
    new DeleteBadgeUseCase(ports.badges),
    new ListUserBadgesUseCase(ports.userBadges),
    new ListRecentUserBadgesUseCase(ports.userBadges),
    new AwardBadgeUseCase(ports.badges, ports.userBadges),
    new RemoveUserBadgeUseCase(ports.userBadges),
    new AssertCanManageUserBadgesUseCase(),
    new ReadUserProgressionUseCase(progression),
    // V8-2 (DEC-212): o fechamento mensal. Chamado só pelo cron; o gate de MANAGE_USERS mora aqui.
    new ResetMonthlyPointsUseCase({ cycle: ports.monthlyCycle }),
    // V8-3 (DEC-214): a revisao semanal de XP. Chamada só pelo cron; o gate de MANAGE_USERS mora aqui.
    new ReviewWeeklyXpUseCase({ weeklyXp: ports.weeklyXp }),
    // V8-4 (DEC-213): o fechamento da temporada. Chamado só pelo cron; o gate de MANAGE_USERS mora aqui.
    new CloseSeasonUseCase({ cycle: ports.seasonCycle, champion: ports.seasonChampion }),
  )
}
