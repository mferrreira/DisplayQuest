import { AwardFromTaskCompletionUseCase } from "@/backend/modules/gamification/application/use-cases/award-from-task-completion.use-case"
import { AwardFromWorkSessionUseCase } from "@/backend/modules/gamification/application/use-cases/award-from-work-session.use-case"
import { EvaluateUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case"
import { GetUserProgressionUseCase } from "@/backend/modules/gamification/application/use-cases/get-user-progression.use-case"
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
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port"
import type { UserStatsPort } from "@/backend/modules/gamification/application/ports/user-stats.port"
import { createPrismaBadgeCatalogPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-badge-catalog.port"
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
 * O `PrismaGamificationGateway` legado (284 linhas) e os engines antigos permanecem
 * VIVOS E INTOCADOS como "implementacao antiga indexada no seam" para o contract suite
 * (OND6-B3, DEC-15); a remocao deles e task OND9-B1.
 */

type UseCaseExecute<T> = T extends { execute: (...args: infer A) => infer R } ? (...args: A) => R : never

export class GamificationModule {
  readonly awardFromWorkSession: UseCaseExecute<AwardFromWorkSessionUseCase>
  readonly awardFromTaskCompletion: UseCaseExecute<AwardFromTaskCompletionUseCase>
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

  constructor(
    private readonly awardFromWorkSessionUseCase: AwardFromWorkSessionUseCase,
    private readonly awardFromTaskCompletionUseCase: AwardFromTaskCompletionUseCase,
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
  ) {
    this.awardFromWorkSession = this.awardFromWorkSessionUseCase.execute.bind(this.awardFromWorkSessionUseCase)
    this.awardFromTaskCompletion = this.awardFromTaskCompletionUseCase.execute.bind(this.awardFromTaskCompletionUseCase)
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
  }
}

export interface GamificationModulePorts {
  users: GamificationUsersPort
  awardHistory: GamificationAwardHistoryPort
  badges: BadgeCatalogPort
  userBadges: UserBadgePort
  stats: UserStatsPort
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
  )
}
