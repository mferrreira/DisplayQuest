import type { ReportingGateway } from "@/backend/modules/reporting/application/ports/reporting.gateway"

export class GetWeeklyReportByIdUseCase {
  constructor(private readonly gateway: ReportingGateway) {}

  async execute(id: number) {
    return await this.gateway.getWeeklyReportById(id)
  }
}
