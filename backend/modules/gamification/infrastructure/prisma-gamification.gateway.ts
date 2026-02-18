import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/database/prisma"
import { BadgeRulesEngine } from "@/backend/modules/gamification/domain/engines/badge-rules.engine"
import { BadgeEngine } from "@/backend/modules/gamification/domain/engines/badge.engine"
import { BadgeRepository, UserBadgeRepository } from "@/backend/repositories/BadgeRepository"
import { UserRepository } from "@/backend/repositories/UserRepository"
import type {
  AwardBadgeCommand,
  AwardFromTaskCompletionCommand,
  AwardFromWorkSessionCommand,
  CreateBadgeCommand,
  GamificationAwardResult,
  GamificationSourceType,
  UpdateBadgeCommand,
  UserProgression,
} from "@/backend/modules/gamification/application/contracts"
import type { GamificationGateway } from "@/backend/modules/gamification/application/ports/gamification.gateway"

const LEVEL_XP_STEP = 100
const ELO_THRESHOLDS = [
  { min: 2500, elo: "DIAMANTE" },
  { min: 1500, elo: "OURO" },
  { min: 700, elo: "PRATA" },
  { min: 0, elo: "BRONZE" },
]

export class PrismaGamificationGateway implements GamificationGateway {
  private readonly badgeEngine: BadgeEngine
  private readonly badgeRulesEngine: BadgeRulesEngine
  private readonly userRepository: UserRepository

  constructor() {
    this.badgeEngine = new BadgeEngine(new BadgeRepository(), new UserBadgeRepository())
    this.badgeRulesEngine = new BadgeRulesEngine()
    this.userRepository = new UserRepository()
  }

  async awardFromWorkSession(command: AwardFromWorkSessionCommand): Promise<GamificationAwardResult> {
    const sourceType: GamificationSourceType = "WORK_SESSION_COMPLETED"
    const sourceId = command.workSessionId

    const alreadyAwarded = await this.hasAward(command.userId, sourceType, sourceId)
    if (alreadyAwarded) {
      const progression = await this.getUserProgression(command.userId)
      return {
        userId: command.userId,
        sourceType,
        sourceId,
        pointsAwarded: 0,
        xpAwarded: 0,
        newProgression: progression,
        alreadyAwarded: true,
      }
    }

    const pointsAwarded = this.calculateWorkSessionPoints(command.durationSeconds, command.completedTaskIds)
    const xpAwarded = pointsAwarded

    const newProgression = await this.applyAward(
      command.userId,
      sourceType,
      sourceId,
      pointsAwarded,
      xpAwarded,
    )

    await this.evaluateUserBadges(command.userId)

    return {
      userId: command.userId,
      sourceType,
      sourceId,
      pointsAwarded,
      xpAwarded,
      newProgression,
      alreadyAwarded: false,
    }
  }

  async awardFromTaskCompletion(command: AwardFromTaskCompletionCommand): Promise<GamificationAwardResult> {
    const sourceType: GamificationSourceType = "TASK_COMPLETED"
    const sourceId = command.taskId

    const alreadyAwarded = await this.hasAward(command.userId, sourceType, sourceId)
    if (alreadyAwarded) {
      const progression = await this.getUserProgression(command.userId)
      return {
        userId: command.userId,
        sourceType,
        sourceId,
        pointsAwarded: 0,
        xpAwarded: 0,
        newProgression: progression,
        alreadyAwarded: true,
      }
    }

    const pointsAwarded =
      command.taskPoints === undefined || command.taskPoints === null
        ? 10
        : Math.floor(command.taskPoints)
    const xpAwarded = pointsAwarded

    const newProgression = await this.applyAward(
      command.userId,
      sourceType,
      sourceId,
      pointsAwarded,
      xpAwarded,
    )

    await this.evaluateUserBadges(command.userId)

    return {
      userId: command.userId,
      sourceType,
      sourceId,
      pointsAwarded,
      xpAwarded,
      newProgression,
      alreadyAwarded: false,
    }
  }

  async getUserProgression(userId: number): Promise<UserProgression> {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, points: true },
    })

    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    const xp = Math.max(0, user.points)
    const level = this.getLevelByXp(xp)
    const nextLevelXp = (level + 1) * LEVEL_XP_STEP
    const previousLevelXp = level * LEVEL_XP_STEP
    const progressToNextLevel = Math.min(
      100,
      Math.floor(((xp - previousLevelXp) / (nextLevelXp - previousLevelXp)) * 100),
    )

    return {
      userId: user.id,
      points: user.points,
      xp,
      level,
      elo: this.getEloByXp(xp),
      nextLevelXp,
      progressToNextLevel: Number.isFinite(progressToNextLevel) ? Math.max(0, progressToNextLevel) : 0,
    }
  }

  async listBadges() {
    return await this.badgeEngine.findAll()
  }

  async getBadgeById(id: number) {
    return await this.badgeEngine.findById(id)
  }

  async createBadge(command: CreateBadgeCommand) {
    return await this.badgeEngine.create(command)
  }

  async updateBadge(command: UpdateBadgeCommand) {
    return await this.badgeEngine.update(command.id, command.data)
  }

  async deleteBadge(id: number) {
    await this.badgeEngine.delete(id)
  }

  async listUserBadges(userId: number) {
    return await this.badgeEngine.getUserBadges(userId)
  }

  async listRecentUserBadges(userId: number, limit?: number) {
    return await this.badgeEngine.getRecentUserBadges(userId, limit)
  }

  async awardBadge(command: AwardBadgeCommand) {
    return await this.badgeEngine.awardBadgeToUser(command.badgeId, command.userId, command.awardedBy)
  }

  async removeUserBadge(userId: number, badgeId: number) {
    await this.badgeEngine.removeBadgeFromUser(userId, badgeId)
  }

  async evaluateUserBadges(userId: number) {
    const user = await this.userRepository.findById(userId)
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    return await this.badgeRulesEngine.evaluateUserForBadges(user)
  }

  private async applyAward(
    userId: number,
    sourceType: GamificationSourceType,
    sourceId: number,
    pointsAwarded: number,
    xpAwarded: number,
  ): Promise<UserProgression> {
    await prisma.$transaction(async (tx) => {
      await tx.users.update({
        where: { id: userId },
        data: {
          points: {
            increment: pointsAwarded,
          },
        },
      })

      await tx.history.create({
        data: {
          entityType: "USER",
          entityId: userId,
          action: "GAMIFICATION_AWARD",
          performedBy: userId,
          description: this.buildAwardDescription(sourceType, sourceId),
          oldValues: Prisma.JsonNull,
          newValues: {
            sourceType,
            sourceId,
            pointsAwarded,
            xpAwarded,
          },
          metadata: {
            domain: "gamification",
            sourceType,
            sourceId,
            pointsAwarded,
            xpAwarded,
          },
        },
      })
    })

    return await this.getUserProgression(userId)
  }

  private async hasAward(userId: number, sourceType: GamificationSourceType, sourceId: number) {
    const existing = await prisma.history.findFirst({
      where: {
        entityType: "USER",
        entityId: userId,
        action: "GAMIFICATION_AWARD",
        description: this.buildAwardDescription(sourceType, sourceId),
      },
      select: { id: true },
    })

    return Boolean(existing)
  }

  private buildAwardDescription(sourceType: GamificationSourceType, sourceId: number) {
    return `GAMIFICATION:${sourceType}:${sourceId}`
  }

  private calculateWorkSessionPoints(durationSeconds?: number | null, completedTaskIds?: number[]) {
    const durationHours = Math.max(0, (durationSeconds || 0) / 3600)
    const durationBonus = Math.min(40, Math.floor(durationHours * 10))
    const taskBonus = Math.min(30, (completedTaskIds?.length || 0) * 5)
    const basePoints = 10
    return Math.max(1, basePoints + durationBonus + taskBonus)
  }

  private getLevelByXp(xp: number) {
    return Math.floor(Math.max(0, xp) / LEVEL_XP_STEP)
  }

  private getEloByXp(xp: number) {
    const normalizedXp = Math.max(0, xp)
    const band = ELO_THRESHOLDS.find((entry) => normalizedXp >= entry.min)
    return band?.elo || "BRONZE"
  }
}

export function createGamificationGateway() {
  return new PrismaGamificationGateway()
}
