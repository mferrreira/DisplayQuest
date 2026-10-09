import type { LabResponsibility } from "@/backend/domain"

/**
 * OND8-B3 — porta fina de `lab_responsibilities` (R2). Colunas startTime/endTime/pausedAt
 * são String ISO no schema; o adapter converte para Date nos records (igual ao
 * LabResponsibility.fromPrisma legado). `findActive` é GLOBAL (QUIRK-8L10).
 */
export interface ResponsibilityRepository {
  findAll(): Promise<LabResponsibility[]>
  findById(id: number): Promise<LabResponsibility | null>
  findActive(): Promise<LabResponsibility | null>
  findActiveForUser(userId: number): Promise<LabResponsibility | null>
  findPausedForUser(userId: number): Promise<LabResponsibility | null>
  findByDateRange(startDate: Date, endDate: Date): Promise<LabResponsibility[]>
  create(input: {
    userId: number
    userName: string
    startTime: Date
    endTime: Date | null
    pausedAt: Date | null
    totalPausedMs: number
    notes: string | null
  }): Promise<LabResponsibility>
  update(
    id: number,
    fields: {
      endTime?: Date
      pausedAt?: Date | null
      totalPausedMs?: number
      notes?: string | null
    },
  ): Promise<LabResponsibility>
  delete(id: number): Promise<void>
}
