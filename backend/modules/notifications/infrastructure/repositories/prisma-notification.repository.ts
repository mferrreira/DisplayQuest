/**
 * PrismaNotificationRepository — thin persistence adapter (OND1-B2, R2/R3; DEC-05).
 *
 * I/O + mapping only: Prisma row <-> `backend/domain` Notification. No business rules here
 * (SPEC §1.2). The data envelope encoding (`JSON.stringify`) lives in the gateway adapter
 * because it is part of the publishEvent contract, not of the row shape.
 */
import { prisma } from "@/lib/database/prisma"
import type { Notification } from "@/backend/domain"
import type {
  CreateNotificationRow,
  NotificationRepository,
} from "@/backend/modules/notifications/application/ports/notification.repository"

type NotificationRow = {
  id: number
  userId: number
  type: string
  title: string
  message: string
  data: string | null
  read: boolean
  createdAt: Date
  readAt: Date | null
}

function toDomain(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    message: row.message,
    data: row.data,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  }
}

export class PrismaNotificationRepository implements NotificationRepository {
  async createMany(rows: CreateNotificationRow[]): Promise<number> {
    const result = await prisma.notifications.createMany({ data: rows })
    return result.count
  }

  async listByUser(userId: number, options: { unreadOnly?: boolean } = {}): Promise<Notification[]> {
    const rows = await prisma.notifications.findMany({
      where: {
        userId,
        ...(options.unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: "desc" },
    })
    return rows.map(toDomain)
  }

  async countUnread(userId: number): Promise<number> {
    return await prisma.notifications.count({
      where: {
        userId,
        read: false,
      },
    })
  }

  async markRead(userId: number, notificationId: number, readAt: Date): Promise<number> {
    const result = await prisma.notifications.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        read: true,
        readAt,
      },
    })
    return result.count
  }

  async markAllRead(userId: number, readAt: Date): Promise<number> {
    const result = await prisma.notifications.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
        readAt,
      },
    })
    return result.count
  }

  async remove(userId: number, notificationId: number): Promise<number> {
    const result = await prisma.notifications.deleteMany({
      where: {
        id: notificationId,
        userId,
      },
    })
    return result.count
  }

  async listActiveUserIds(): Promise<number[]> {
    const users = await prisma.users.findMany({
      where: { status: "active" },
      select: { id: true },
    })
    return users.map((user) => user.id)
  }
}

export function createPrismaNotificationRepository(): PrismaNotificationRepository {
  return new PrismaNotificationRepository()
}
