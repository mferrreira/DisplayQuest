import type { ReportingGateway } from "@/backend/modules/reporting/application/ports/reporting.gateway"

export class DeleteWeeklyReportUseCase {
  constructor(private readonly gateway: ReportingGateway) {}

  async execute(id: number) {
    await this.gateway.deleteWeeklyReport(id)
  }
}
