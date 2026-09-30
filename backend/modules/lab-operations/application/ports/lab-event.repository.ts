import type { LabEvent } from "@/backend/domain"

/** OND8-B3 — porta fina de `lab_events` (R2). Janelas de data são calculadas no use case. */
export interface LabEventRepository {
  findById(id: number): Promise<LabEvent | null>
  findByDateRange(start: Date, end: Date): Promise<LabEvent[]>
  create(input: { userId: number; userName: string; date: Date; note: string }): Promise<LabEvent>
  update(id: number, fields: { date?: Date; note?: string }): Promise<LabEvent>
  delete(id: number): Promise<void>
}
