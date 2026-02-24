import type {
  AwardBadgeCommand,
  AwardFromTaskCompletionCommand,
  AwardFromWorkSessionCommand,
  CreateBadgeCommand,
  UpdateBadgeCommand,
} from "@/backend/modules/gamification/application/contracts"
import { TaskCompletionProgressionEngine } from "@/backend/modules/gamification/application/use-cases/award-from-task-completion.use-case"
import { WorkSessionProgressionEngine } from "@/backend/modules/gamification/application/use-cases/award-from-work-session.use-case"
import { UserProgressionEngine } from "@/backend/modules/gamification/application/use-cases/get-user-progression.use-case"
import {
  createGamificationGateway,
  PrismaGamificationGateway,
} from "@/backend/modules/gamification/infrastructure/prisma-gamification.gateway"

export class GamificationModule {
  constructor(
    private readonly workSessionProgressionEngine: WorkSessionProgressionEngine,
    private readonly taskCompletionProgressionEngine: TaskCompletionProgressionEngine,
    private readonly userProgressionEngine: UserProgressionEngine,
    private readonly _gateway: PrismaGamificationGateway,
  ) {}

  async awardFromWorkSession(command: AwardFromWorkSessionCommand) {
    return await this.workSessionProgressionEngine.execute(command)
  }

  async awardFromTaskCompletion(command: AwardFromTaskCompletionCommand) {
    return await this.taskCompletionProgressionEngine.execute(command)
  }

  async getUserProgression(userId: number) {
    return await this.userProgressionEngine.execute(userId)
  }

  async listBadges() {
    return await this._gateway.listBadges()
  }

  async getBadgeById(id: number) {
    return await this._gateway.getBadgeById(id)
  }

  async createBadge(command: CreateBadgeCommand) {
    return await this._gateway.createBadge(command)
  }

  async updateBadge(command: UpdateBadgeCommand) {
    return await this._gateway.updateBadge(command)
  }

  async deleteBadge(id: number) {
    await this._gateway.deleteBadge(id)
  }

  async listUserBadges(userId: number) {
    return await this._gateway.listUserBadges(userId)
  }

  async listRecentUserBadges(userId: number, limit?: number) {
    return await this._gateway.listRecentUserBadges(userId, limit)
  }

  async awardBadge(command: AwardBadgeCommand) {
    return await this._gateway.awardBadge(command)
  }

  async removeUserBadge(userId: number, badgeId: number) {
    await this._gateway.removeUserBadge(userId, badgeId)
  }

  async evaluateUserBadges(userId: number) {
    return await this._gateway.evaluateUserBadges(userId)
  }
}

export interface GamificationModuleFactoryOptions {
  gateway?: PrismaGamificationGateway
}

export function createGamificationModule(options: GamificationModuleFactoryOptions = {}) {
  const gateway = options.gateway ?? createGamificationGateway()
  return new GamificationModule(
    new WorkSessionProgressionEngine(gateway),
    new TaskCompletionProgressionEngine(gateway),
    new UserProgressionEngine(gateway),
    gateway,
  )
}
