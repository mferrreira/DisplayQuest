import { AwardFromTaskCompletionUseCase } from "@/backend/modules/gamification/application/use-cases/award-from-task-completion.use-case"
import { AwardFromActivityCompletionUseCase } from "@/backend/modules/gamification/application/use-cases/award-from-activity-completion.use-case"
import { AwardFromWorkSessionUseCase } from "@/backend/modules/gamification/application/use-cases/award-from-work-session.use-case"
import { AssertCanManageUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/assert-can-manage-user-badges.use-case"
import { CloseBoardMonthUseCase } from "@/backend/modules/gamification/application/use-cases/close-board-month.use-case"
import { EvaluateUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case"
import { GetUserProgressionUseCase } from "@/backend/modules/gamification/application/use-cases/get-user-progression.use-case"
import { ReadBoardMonthUseCase } from "@/backend/modules/gamification/application/use-cases/read-board-month.use-case"
import { ReadUserProgressionUseCase } from "@/backend/modules/gamification/application/use-cases/read-user-progression.use-case"
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
import type { BoardMonthClosePort } from "@/backend/modules/gamification/application/ports/board-month-close.port"
import type { GamificationAwardHistoryPort } from "@/backend/modules/gamification/application/ports/gamification-award-history.port"
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port"
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port"
import type { UserStatsPort } from "@/backend/modules/gamification/application/ports/user-stats.port"
import { createPrismaBadgeCatalogPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-badge-catalog.port"
import { createPrismaBoardMonthClosePort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-board-month-close.port"
import { createPrismaGamificationAwardHistoryPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-gamification-award-history.port"
import { createPrismaGamificationUsersPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-gamification-users.port"
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
  /** plan-v9 S01: qual mes o quadro esta usando e com que trilha (R4). */
  readonly readBoardMonth: UseCaseExecute<ReadBoardMonthUseCase>
  /**
   * plan-v9 S02 (R5, R6, CA2): fecha o mes civil anterior, grava as linhas do quadro e zera o
   * placar do mes. Dois donos, a familia do DEC-54: `POST /api/board/close` (gestao) e o cron
   * `0 0 1 * *`, que passa `systemActor("MONTH_CLOSE")`.
   */
  readonly closeBoardMonth: UseCaseExecute<CloseBoardMonthUseCase>

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
    private readonly readBoardMonthUseCase: ReadBoardMonthUseCase,
    private readonly closeBoardMonthUseCase: CloseBoardMonthUseCase,
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
    this.readBoardMonth = this.readBoardMonthUseCase.execute.bind(this.readBoardMonthUseCase)
    this.closeBoardMonth = this.closeBoardMonthUseCase.execute.bind(this.closeBoardMonthUseCase)
  }
}

export interface GamificationModulePorts {
  users: GamificationUsersPort
  awardHistory: GamificationAwardHistoryPort
  badges: BadgeCatalogPort
  userBadges: UserBadgePort
  stats: UserStatsPort
  /** plan-v9 S02: leitura do registro de mes e escrita do fechamento (ADR-002). */
  monthClose: BoardMonthClosePort
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
    monthClose: options.ports?.monthClose ?? createPrismaBoardMonthClosePort(),
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
    new ReadBoardMonthUseCase(),
    new CloseBoardMonthUseCase(ports.monthClose),
  )
}
