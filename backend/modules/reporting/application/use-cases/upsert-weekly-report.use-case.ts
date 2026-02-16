import type { UpsertWeeklyReportCommand } from "@/backend/modules/reporting/application/contracts"
import type { ReportingGateway } from "@/backend/modules/reporting/application/ports/reporting.gateway"

export class UpsertWeeklyReportUseCase {
  constructor(private readonly gateway: ReportingGateway) {}

  async execute(command: UpsertWeeklyReportCommand) {
    if (!Number.isInteger(command.userId) || command.userId <= 0) {
      throw new Error("Usuário inválido")
    }

    return await this.gateway.upsertWeeklyReport(command)
  }
}
