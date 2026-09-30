import { BadgeRepository, UserBadgeRepository } from "@/backend/repositories/BadgeRepository"
import { UserRepository } from "@/backend/repositories/UserRepository"
import { Badge } from "@/backend/models/Badge"
import { User } from "@/backend/models/user/User"

export interface BadgeCriteria {
  points?: number
  tasks?: number
  projects?: number
  workSessions?: number
  weeklyHours?: number
  consecutiveDays?: number
  specialCondition?: string
}

export class BadgeRulesEngine {
  private badgeRepo: BadgeRepository
  private userRepo: UserRepository
  private userBadgeRepo: UserBadgeRepository

  constructor() {
    this.badgeRepo = new BadgeRepository()
    this.userRepo = new UserRepository()
    this.userBadgeRepo = new UserBadgeRepository()
  }

  async evaluateAllUsers(): Promise<void> {
    const users = await this.userRepo.findAll()
    const activeBadges = await this.badgeRepo.findActive()

    for (const user of users) {
      await this.evaluateUserForBadges(user, activeBadges)
    }
  }

  async evaluateUserForBadges(user: User, badges?: Badge[]): Promise<Badge[]> {
    const currentBadges = badges || (await this.badgeRepo.findActive())

    const userBadges = await this.userBadgeRepo.findByUserId(user.id!)
    const earnedBadgeIds = userBadges.map((ub) => ub.badgeId)

    const newlyEarnedBadges: Badge[] = []

    for (const badge of currentBadges) {
      if (earnedBadgeIds.includes(badge.id!)) {
        continue
      }

      if (await this.userMeetsCriteria(user, badge.criteria as BadgeCriteria | undefined)) {
        try {
          await this.userBadgeRepo.create({
            userId: user.id!,
            badgeId: badge.id!,
            earnedBy: null,
          } as any)

          newlyEarnedBadges.push(badge)
        } catch (error) {
          console.error(`Error awarding badge ${badge.id} to user ${user.id}:`, error)
        }
      }
    }

    return newlyEarnedBadges
  }

  private async userMeetsCriteria(user: User, criteria?: BadgeCriteria): Promise<boolean> {
    if (!criteria) return false

    const userStats = await this.getUserStatistics(user.id!)

    if (criteria.points && userStats.points < criteria.points) return false
    if (criteria.tasks && userStats.completedTasks < criteria.tasks) return false
    if (criteria.projects && userStats.projectsCount < criteria.projects) return false
    if (criteria.workSessions && userStats.workSessionsCount < criteria.workSessions) return false
    if (criteria.weeklyHours && userStats.averageWeeklyHours < criteria.weeklyHours) return false
    if (criteria.consecutiveDays && userStats.maxConsecutiveDays < criteria.consecutiveDays) return false

    if (criteria.specialCondition) {
      return await this.evaluateSpecialCondition(user, criteria.specialCondition, userStats)
    }

    return true
  }

  private async getUserStatistics(userId: number): Promise<{
    points: number
    completedTasks: number
    projectsCount: number
    workSessionsCount: number
    averageWeeklyHours: number
    maxConsecutiveDays: number
  }> {
    try {
      const user = await this.userRepo.findById(userId)
      if (!user) {
        throw new Error(`User ${userId} not found`)
      }

      const projectsCount = await this.userRepo.getUserProjectsCount(userId)
      const workSessionsCount = await this.userRepo.getUserWorkSessionsCount(userId)
      const averageWeeklyHours = await this.userRepo.getUserAverageWeeklyHours(userId)
      const maxConsecutiveDays = await this.userRepo.getUserMaxConsecutiveDays(userId)

      return {
        points: user.points,
        completedTasks: user.completedTasks,
        projectsCount,
        workSessionsCount,
        averageWeeklyHours,
        maxConsecutiveDays,
      }
    } catch (error) {
      console.error(`Error getting statistics for user ${userId}:`, error)
      return {
        points: 0,
        completedTasks: 0,
        projectsCount: 0,
        workSessionsCount: 0,
        averageWeeklyHours: 0,
        maxConsecutiveDays: 0,
      }
    }
  }

  private async evaluateSpecialCondition(user: User, condition: string, stats: any): Promise<boolean> {
    const conditionLower = condition.toLowerCase()

    if (conditionLower.includes("primeiro") && conditionLower.includes("100")) {
      if (conditionLower.includes("tarefas") && stats.completedTasks >= 100) {
        const allUsers = await this.userRepo.findAll()
        const usersWith100Tasks = allUsers.filter((u) => u.completedTasks >= 100)
        return usersWith100Tasks.length === 1 && usersWith100Tasks[0].id === user.id
      }

      if (conditionLower.includes("pontos") && stats.points >= 100) {
        const allUsers = await this.userRepo.findAll()
        const usersWith100Points = allUsers.filter((u) => u.points >= 100)
        return usersWith100Points.length === 1 && usersWith100Points[0].id === user.id
      }
    }

    if (conditionLower.includes("semana perfeita")) {
      return stats.averageWeeklyHours >= user.weekHours
    }

    if (conditionLower.includes("sequência") && conditionLower.includes("dias")) {
      return stats.maxConsecutiveDays >= 7
    }

    if (conditionLower.includes("coordenador") && user.hasRole("COORDENADOR")) {
      return true
    }

    if (conditionLower.includes("gerente") && user.hasRole("GERENTE")) {
      return true
    }

    return true
  }
}
