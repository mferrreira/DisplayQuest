import type { LaboratorySchedule } from "@/backend/domain"

/** OND8-B3 — porta fina de `laboratory_schedules` (R2). */
export interface LaboratoryScheduleRepository {
  findAll(): Promise<LaboratorySchedule[]>
  findById(id: number): Promise<LaboratorySchedule | null>
  create(input: { dayOfWeek: number; startTime: string; endTime: string; notes?: string | null }): Promise<LaboratorySchedule>
  update(id: number, fields: { startTime?: string; endTime?: string; notes?: string | null }): Promise<LaboratorySchedule>
  delete(id: number): Promise<void>
}
