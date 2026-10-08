import { requireActorSelfOrPermission } from "@/backend/domain/identity"
import type { UpsertWeeklyReportCommand, WeeklyReportReadModel } from "@/backend/modules/reporting/application/contracts"
import type { UpsertWeeklyReportUseCase } from "@/backend/modules/reporting/application/use-cases/upsert-weekly-report.use-case"

/**
 * GenerateWeeklyReportUseCase — POST /api/weekly-reports/generate (B6-3, D4).
 *
 * Medido: as DUAS rotas de criação de relatório semanal têm gates DIFERENTES para o mesmo
 * upsert. `POST /weekly-reports` aceita a regra composta (LABORATORISTA cria para terceiro);
 * `POST /weekly-reports/generate` usa `ensureSelfOrPermission(actor, userId, "MANAGE_USERS")`
 * — LABORATORISTA NÃO cria para terceiro por aqui, e a mensagem é o default "Acesso negado".
 * Colocar um gate único nos dois trocaria o comportamento de uma rota. O generate mantém o
 * seu gate estrito (self || MANAGE_USERS) e delega no mesmo UpsertWeeklyReportUseCase: quem
 * passa o gate estrito sempre passa o composto depois (MANAGE_USERS ⊂ composta; self passa
 * nos dois), então a delegação é segura e não há flag de "modo" — flags seriam a dívida do
 * D4 com outra grafia.
 */
export class GenerateWeeklyReportUseCase {
  constructor(private readonly upsertWeeklyReport: UpsertWeeklyReportUseCase) {}

  async execute(command: UpsertWeeklyReportCommand): Promise<WeeklyReportReadModel> {
    requireActorSelfOrPermission(command.actor, command.userId, "MANAGE_USERS")
    return await this.upsertWeeklyReport.execute(command)
  }
}
