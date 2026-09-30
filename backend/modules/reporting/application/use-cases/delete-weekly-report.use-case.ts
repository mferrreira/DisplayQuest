import type { WeeklyReportsRepository } from "@/backend/modules/reporting/application/ports/weekly-reports.repository"

/**
 * OND7-B3 — frozen from deleteWeeklyReport (gateway:175-177): no existence pre-check;
 * a missing id propagates Prisma P2025 (QUIRK-7K).
 */
export class DeleteWeeklyReportUseCase {
  constructor(private readonly weeklyReports: WeeklyReportsRepository) {}

  async execute(id: number): Promise<void> {
    await this.weeklyReports.delete(id)
  }
}
