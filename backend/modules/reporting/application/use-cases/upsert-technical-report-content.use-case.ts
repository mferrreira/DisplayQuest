/**
 * UpsertTechnicalReportContentUseCase — escrita do texto do relatório técnico
 * (V5-9, DEC-70/139/167).
 *
 * Ordem das recusas medida pela casa (404 → 403 → 400): projeto ausente primeiro (sem
 * projeto não há o que gate-ar), depois o gate "gestão/líder" (DEC-139) e só então as
 * validações de corpo — quem não pode recebe o 403 mesmo com corpo inválido (lição
 * B6-2b: o 403 não pode passar depois dos 400).
 *
 * O par (projeto, tipo) é único no schema: o upsert é o "um registro editável por par"
 * da DEC-70 — a segunda escrita atualiza o conteúdo do mesmo registro.
 */
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  canActorManageTechnicalReportDecision,
  invalidTechnicalReportTypeError,
  isTechnicalReportType,
  type TechnicalReportType,
} from "@/backend/domain";
import type { TechnicalReportAccessPort } from "@/backend/modules/reporting/application/ports/technical-report-access.port";
import type {
  TechnicalReportRecord,
  TechnicalReportsRepository,
} from "@/backend/modules/reporting/application/ports/technical-reports.repository";

export interface UpsertTechnicalReportContentCommand {
  projectId: number;
  actorId: number;
  /** Papéis GLOBAIS do ator (normalizedRoles na rota) — a ACL decide com eles quando não há membership. */
  actorRoles: string[];
  type: string;
  content: unknown;
}

export interface UpsertTechnicalReportContentResult {
  report: TechnicalReportRecord;
}

export const TECHNICAL_REPORT_DENIED_MESSAGE =
  "Usuário não tem permissão para editar o relatório técnico deste projeto";

export class UpsertTechnicalReportContentUseCase {
  constructor(
    private readonly ports: {
      technicalReports: TechnicalReportsRepository;
      access: TechnicalReportAccessPort;
    },
  ) {}

  async execute(
    command: UpsertTechnicalReportContentCommand,
  ): Promise<UpsertTechnicalReportContentResult> {
    const access = await this.ports.access.findProjectAccess(command.projectId, command.actorId);
    if (!access) {
      throw new NotFoundError("Projeto não encontrado");
    }

    const canManage = canActorManageTechnicalReportDecision(
      command.actorId,
      command.actorRoles,
      access.leaderId,
      access.membershipRoles,
    );
    if (!canManage) {
      throw new ForbiddenError(TECHNICAL_REPORT_DENIED_MESSAGE);
    }

    if (!isTechnicalReportType(command.type)) {
      throw invalidTechnicalReportTypeError();
    }
    const type: TechnicalReportType = command.type;

    if (typeof command.content !== "string") {
      throw new ValidationError("Conteúdo do relatório técnico é obrigatório");
    }

    const report = await this.ports.technicalReports.upsert(command.projectId, type, command.content);
    return { report };
  }
}
