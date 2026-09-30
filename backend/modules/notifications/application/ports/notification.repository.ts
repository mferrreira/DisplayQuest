/**
 * NotificationRepository — persistence port of the notifications module (OND1-B2, DEC-05).
 *
 * Declared by `application`, implemented by `infrastructure/repositories`. The adapter returns
 * domain types only (SPEC §4.2): `Notification` with ISO-string timestamps, never Prisma rows.
 * Ownership scoping is part of the method signatures (userId is always passed) — the use case
 * decides the scope, the adapter only executes it.
 */
import type { Notification } from "@/backend/domain";

export interface ActiveUserDirectory {
  listActiveUserIds(): Promise<number[]>;
}

export interface CreateNotificationRow {
  userId: number;
  type: string;
  title: string;
  message: string;
  /** Already-encoded envelope (String column). `null` = no payload. */
  data: string | null;
}

export interface NotificationRepository extends ActiveUserDirectory {
  createMany(rows: CreateNotificationRow[]): Promise<number>;
  listByUser(userId: number, options?: { unreadOnly?: boolean }): Promise<Notification[]>;
  countUnread(userId: number): Promise<number>;
  /** Scoped by (userId, notificationId). Returns the number of rows affected. */
  markRead(userId: number, notificationId: number, readAt: Date): Promise<number>;
  markAllRead(userId: number, readAt: Date): Promise<number>;
  /** Scoped by (userId, notificationId). Returns the number of rows deleted. */
  remove(userId: number, notificationId: number): Promise<number>;
}
