import { prisma } from "@/lib/database/prisma"
import type { WorkSession } from "@/backend/domain"
import type {
  NewWorkSession,
  WorkSessionRepositoryPort,
} from "@/backend/modules/work-execution/application/ports/work-session.repository"

/**
 * PrismaWorkSessionRepository (OND3-B2, R2) — thin adapter implementing WorkSessionRepositoryPort.
 *
 * Semantics mirrored from backend/repositories/WorkSessionRepository (frozen by golden OND3-B1):
 * reads ordered by startTime desc; findActiveByUserId = first active session; update merges only
 * the keys present in the partial and returns the persisted row. No rules here — mapping only.
 */
function toDomain(row: {
  id: number
  userId: number
  userName: string
  startTime: Date
  endTime: Date | null
  duration: number | null
  activity: string | null
  location: string | null
  projectId: number | null
  status: string
  createdAt: Date
  updatedAt: Date
}): WorkSession {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    startTime: row.startTime,
    endTime: row.endTime,
    duration: row.duration,
    activity: row.activity,
    location: row.location,
    projectId: row.projectId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PrismaWorkSessionRepository implements WorkSessionRepositoryPort {
  async findById(id: number): Promise<WorkSession | null> {
    const row = await prisma.work_sessions.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async findActiveByUserId(userId: number): Promise<WorkSession | null> {
    const row = await prisma.work_sessions.findFirst({
      where: { userId, status: "active" },
      orderBy: { startTime: "desc" },
    })
    return row ? toDomain(row) : null
  }

  async findByUserId(userId: number): Promise<WorkSession[]> {
    const rows = await prisma.work_sessions.findMany({
      where: { userId },
      orderBy: { startTime: "desc" },
    })
    return rows.map(toDomain)
  }

  async findAll(): Promise<WorkSession[]> {
    const rows = await prisma.work_sessions.findMany({ orderBy: { startTime: "desc" } })
    return rows.map(toDomain)
  }

  async findByStatus(status: string): Promise<WorkSession[]> {
    const rows = await prisma.work_sessions.findMany({
      where: { status },
      orderBy: { startTime: "desc" },
    })
    return rows.map(toDomain)
  }

  async create(session: NewWorkSession): Promise<WorkSession> {
    const row = await prisma.work_sessions.create({
      data: {
        userId: session.userId,
        userName: session.userName,
        startTime: session.startTime,
        endTime: session.endTime ?? null,
        duration: session.duration ?? null,
        activity: session.activity ?? null,
        location: session.location ?? null,
        projectId: session.projectId ?? null,
        status: session.status,
      },
    })
    return toDomain(row)
  }

  async update(id: number, updates: Partial<WorkSession>): Promise<WorkSession> {
    const data: Record<string, unknown> = {}
    for (const key of ["userName", "startTime", "endTime", "duration", "activity", "location", "projectId", "status"] as const) {
      if (updates[key] !== undefined) data[key] = updates[key]
    }

    const row = await prisma.work_sessions.update({ where: { id }, data })
    return toDomain(row)
  }

  async delete(id: number): Promise<void> {
    await prisma.work_sessions.delete({ where: { id } })
  }

  async replaceSessionTasks(sessionId: number, taskIds: number[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.work_session_tasks.deleteMany({ where: { workSessionId: sessionId } })

      if (taskIds.length > 0) {
        await tx.work_session_tasks.createMany({
          data: taskIds.map((taskId) => ({ workSessionId: sessionId, taskId })),
          skipDuplicates: true,
        })
      }
    })
  }
}

export function createPrismaWorkSessionRepository(): PrismaWorkSessionRepository {
  return new PrismaWorkSessionRepository()
}
