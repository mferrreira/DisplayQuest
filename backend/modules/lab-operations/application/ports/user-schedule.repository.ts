import type { UserSchedule } from "@/backend/domain"

/**
 * OND8-B3 — porta fina de `user_schedules` (R2). `replaceForUser` é o $transaction
 * [deleteMany, createMany] legado — SEM validação por slot (QUIRK-8L13); a validação é
 * decisão do use case, não da porta.
 */
export interface UserScheduleRepository {
  findAll(): Promise<UserSchedule[]>
  findByUserId(userId: number): Promise<UserSchedule[]>
  findById(id: number): Promise<UserSchedule | null>
  create(input: { userId: number; dayOfWeek: number; startTime: string; endTime: string }): Promise<UserSchedule>
  update(id: number, fields: { startTime?: string; endTime?: string }): Promise<UserSchedule>
  delete(id: number): Promise<void>
  replaceForUser(userId: number, slots: { dayOfWeek: number; startTime: string; endTime: string }[]): Promise<UserSchedule[]>
}
