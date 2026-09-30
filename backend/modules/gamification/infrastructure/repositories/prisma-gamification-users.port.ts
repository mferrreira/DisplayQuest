import { prisma } from "@/lib/database/prisma"
import type {
  GamificationUserRecord,
  GamificationUsersPort,
} from "@/backend/modules/gamification/application/ports/gamification-users.port"
import type { UserRankEntry } from "@/backend/domain"

/**
 * OND6-B2 (R1) — leitura de usuarios na forma minima que as regras leem. O legado ia
 * por UserRepository.findById com include completo de relacoes (projects/purchases/
 * tasks/schedules/...); as regras de gamificacao so leem points/completedTasks/
 * weekHours/roles — o adapter fino corta o join (queries equivalentes na saida).
 */
export function createPrismaGamificationUsersPort(): GamificationUsersPort {
  return {
    async findProgressionById(userId) {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { id: true, points: true },
      })
      return user ? { id: user.id, points: user.points } : null
    },
    async findUserById(userId) {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { id: true, points: true, completedTasks: true, weekHours: true, roles: true },
      })
      if (!user) {
        return null
      }
      const record: GamificationUserRecord = {
        id: user.id,
        points: user.points,
        completedTasks: user.completedTasks,
        weekHours: user.weekHours,
        roles: (user.roles ?? []) as unknown as string[],
      }
      return record
    },
    async findAllUsers() {
      const users = await prisma.users.findMany({
        select: { id: true, points: true, completedTasks: true },
      })
      return users.map((user): UserRankEntry => ({ id: user.id, points: user.points, completedTasks: user.completedTasks }))
    },
  }
}
