/**
 * ListTechnicalReportsUseCase — leitura dos relatórios técnicos de um projeto
 * (V5-9, regra 13 do plano / DEC-127/136).
 *
 * Sem gate de propósito: relatório técnico é filho de projeto e herda a leitura aberta
 * do autenticado. O único "não" que esta leitura responde é o 404 de projeto ausente.
 */
import { NotFoundError } from "@/backend/domain";
import type { TechnicalReportAccessPort } from "@/backend/modules/reporting/application/ports/technical-report-access.port";
import type {
  TechnicalReportRecord,
  TechnicalReportsRepository,
} from "@/backend/modules/reporting/application/ports/technical-reports.repository";

export interface ListTechnicalReportsCommand {
  projectId: number;
}

export interface ListTechnicalReportsResult {
  reports: TechnicalReportRecord[];
}

export class ListTechnicalReportsUseCase {
  constructor(
    private readonly ports: {
      technicalReports: TechnicalReportsRepository;
      access: TechnicalReportAccessPort;
    },
  ) {}

  async execute(command: ListTechnicalReportsCommand): Promise<ListTechnicalReportsResult> {
    const access = await this.ports.access.findProjectAccess(command.projectId, null);
    if (!access) {
      throw new NotFoundError("Projeto não encontrado");
    }
    const reports = await this.ports.technicalReports.listByProject(command.projectId);
    return { reports };
  }
}
