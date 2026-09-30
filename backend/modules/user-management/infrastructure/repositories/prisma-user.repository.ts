/**
 * PrismaUserRepository — thin persistence adapter of the user-management module (OND2-B2).
 *
 * I/O + mapping only (SPEC §1.2): Prisma row <-> `UserRecord`. No business rules, no `User`
 * model class, no relation includes (the transport shape never carried relations — the model's
 * toJSON proves it). The statistics/role-count computations mirror `backend/repositories/
 * UserRepository.ts` exactly (frozen by the golden matrix).
 */
import { prisma } from "@/lib/database/prisma"
import type { ProfileVisibility, UserRole } from "@/backend/domain"
import type {
  NewUserRecord,
  UserRecord,
  UserRepositoryPort,
  UserStatistics,
  UserSummaryRow,
} from "@/backend/modules/user-management/application/ports/user.repository"

type UserRow = {
  id: number
  name: string
  email: string
  points: number
  completedTasks: number
  password: string | null
  status: string
  weekHours: number
  currentWeekHours: number
  profileVisibility: ProfileVisibility
  bio: string | null
  avatar: string | null
  roles: UserRole[]
  createdAt: Date
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    points: row.points,
    completedTasks: row.completedTasks,
    password: row.password,
    status: row.status,
    weekHours: row.weekHours,
    currentWeekHours: row.currentWeekHours,
    profileVisibility: row.profileVisibility,
    bio: row.bio,
    avatar: row.avatar,
    roles: row.roles,
    createdAt: row.createdAt,
  }
}

export class PrismaUserRepository implements UserRepositoryPort {
  async findById(id: number): Promise<UserRecord | null> {
    const row = await prisma.users.findUnique({ where: { id } })
    return row ? toRecord(row) : null
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await prisma.users.findUnique({ where: { email: email.toLowerCase() } })
    return row ? toRecord(row) : null
  }

  async create(data: NewUserRecord): Promise<UserRecord> {
    const row = await prisma.users.create({ data })
    return toRecord(row)
  }

  async update(record: UserRecord): Promise<UserRecord> {
    const row = await prisma.users.update({
      where: { id: record.id },
      data: {
        name: record.name,
        email: record.email,
        points: record.points,
        completedTasks: record.completedTasks,
        password: record.password,
        status: record.status,
        weekHours: record.weekHours,
        currentWeekHours: record.currentWeekHours,
        profileVisibility: record.profileVisibility,
        bio: record.bio,
        avatar: record.avatar,
        roles: record.roles,
      },
    })
    return toRecord(row)
  }

  async delete(id: number): Promise<void> {
    await prisma.users.delete({ where: { id } })
  }

  async findPending(): Promise<UserRecord[]> {
    const rows = await prisma.users.findMany({ where: { status: "pending" } })
    return rows.map(toRecord)
  }

  async findActiveUsers(): Promise<UserSummaryRow[]> {
    const rows = await prisma.users.findMany({
      where: { status: "active" },
      select: {
        id: true,
        name: true,
        email: true,
        roles: true,
        status: true,
        weekHours: true,
        points: true,
        completedTasks: true,
        avatar: true,
        bio: true,
      },
      orderBy: { name: "asc" },
    })
    return rows
  }

  async findTopByPoints(limit: number): Promise<UserRecord[]> {
    const rows = await prisma.users.findMany({
      where: { status: "active" },
      orderBy: { points: "desc" },
      take: limit,
    })
    return rows.map(toRecord)
  }

  async findTopByTasks(limit: number): Promise<UserRecord[]> {
    const rows = await prisma.users.findMany({
      where: { status: "active" },
      orderBy: { completedTasks: "desc" },
      take: limit,
    })
    return rows.map(toRecord)
  }

  async findAll(): Promise<UserRecord[]> {
    const rows = await prisma.users.findMany()
    return rows.map(toRecord)
  }

  async findByProfileVisibility(_visibility: ProfileVisibility): Promise<UserRecord[]> {
    // CURRENT quirk mirrored from backend/repositories/UserRepository.ts: returns ALL users.
    const rows = await prisma.users.findMany()
    return rows.map(toRecord)
  }

  async getUsersByRole(): Promise<Record<string, number>> {
    const allUsers = await this.findAll()
    const roleCounts: Record<string, number> = {
      COORDENADOR: 0,
      GERENTE: 0,
      LABORATORISTA: 0,
      PESQUISADOR: 0,
      GERENTE_PROJETO: 0,
      COLABORADOR: 0,
      VOLUNTARIO: 0,
    }
    for (const user of allUsers) {
      for (const role of user.roles) {
        roleCounts[role] = (roleCounts[role] ?? 0) + 1
      }
    }
    return roleCounts
  }

  async getUsersByStatus(): Promise<Record<string, number>> {
    const allUsers = await this.findAll()
    const statusCounts: Record<string, number> = {
      active: 0,
      pending: 0,
      rejected: 0,
      suspended: 0,
      inactive: 0,
    }
    for (const user of allUsers) {
      statusCounts[user.status] = (statusCounts[user.status] ?? 0) + 1
    }
    return statusCounts
  }

  async getUserStatistics(): Promise<UserStatistics> {
    const allUsers = await this.findAll()
    const total = allUsers.length
    const totalPoints = allUsers.reduce((sum, user) => sum + user.points, 0)
    const totalTasks = allUsers.reduce((sum, user) => sum + user.completedTasks, 0)
    return {
      total,
      active: allUsers.filter((u) => u.status === "active").length,
      pending: allUsers.filter((u) => u.status === "pending").length,
      rejected: allUsers.filter((u) => u.status === "rejected").length,
      suspended: allUsers.filter((u) => u.status === "suspended").length,
      inactive: allUsers.filter((u) => u.status === "inactive").length,
      totalPoints,
      totalTasks,
      averagePoints: total > 0 ? Math.round(totalPoints / total) : 0,
      averageTasks: total > 0 ? Math.round(totalTasks / total) : 0,
    }
  }

  async isProjectMember(userId: number, projectId?: number): Promise<boolean> {
    const found = await prisma.project_members.findFirst({
      where: {
        userId,
        ...(projectId !== undefined ? { projectId } : {}),
      },
      select: { id: true },
    })
    return found !== null
  }

  async leadsProject(userId: number, projectId?: number): Promise<boolean> {
    const found = await prisma.projects.findFirst({
      where: {
        ...(projectId !== undefined ? { id: projectId } : {}),
        leaderId: userId,
      },
      select: { id: true },
    })
    return found !== null
  }
}

export function createPrismaUserRepository(): PrismaUserRepository {
  return new PrismaUserRepository()
}
