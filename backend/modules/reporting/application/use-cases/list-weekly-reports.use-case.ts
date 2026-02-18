import type { WeeklyReportListQuery } from "@/backend/modules/reporting/application/contracts"
import type { ReportingGateway } from "@/backend/modules/reporting/application/ports/reporting.gateway"

export class ListWeeklyReportsUseCase {
  constructor(private readonly gateway: ReportingGateway) {}

  async execute(query: WeeklyReportListQuery) {
    return await this.gateway.listWeeklyReports(query)
  }
}
