import { NotFoundError } from "@/backend/domain/errors"
import { requireWeeklyReportSelfOrView } from "@/backend/domain/reporting"
import type { ActorRef } from "@/backend/domain"
import type { WeeklyReportsRepository } from "@/backend/modules/reporting/application/ports/weekly-reports.repository"

/**
 * OND7-B3 — frozen from deleteWeeklyReport (gateway:175-177): no existence pre-check;
 * a missing id propagates Prisma P2025 (QUIRK-7K).
 *
 * B6-3 (D4): a rota pré-buscava o relatório para decidir o gate (404 legado -> 403 "Sem
 * permissão" -> delete). O pre-check era a ROTA decidindo; ele desceu junto com o gate.
 * Ordem medida preservada: 404 antes do 403, gate antes do delete. O 404 passa a ser o
 * NotFoundError mapeado ({error, code, details}) — mesma evolução documentada de
 * purchases/[id] no B5 e do PATCH no B6-2d; o QUIRK-7K continua intacto para a corrida
 * fetch->delete (registro existe, some entre os dois -> P2025 propagado, 500 legado).
 */
export class DeleteWeeklyReportUseCase {
  constructor(private readonly weeklyReports: WeeklyReportsRepository) {}

  async execute(actor: ActorRef, id: number): Promise<void> {
    const report = await this.weeklyReports.findById(id)
    if (!report) {
      throw new NotFoundError("Relatório não encontrado")
    }
    requireWeeklyReportSelfOrView(actor, report.userId)
    await this.weeklyReports.delete(id)
  }
}
