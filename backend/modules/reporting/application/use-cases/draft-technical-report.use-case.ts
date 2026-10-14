/**
 * DraftTechnicalReportUseCase — rascunho de IA a partir das três fontes do plano
 * (V5-9c, DEC-139/152/168).
 *
 * Ordem de recusa igual à da geração (404 projeto → 403 gate → 400 tipo), mas o
 * rascunho NÃO exige texto salvo nem membros ATIVOS: ele é o ponto de partida do
 * editor, não o documento. A janela das fontes é o período do relatório (DEC-167),
 * derivado pela regra pura; o prompt sai de `buildTechnicalReportDraftPrompt` (fonte
 * única das seções, DEC-168) e a IA é a porta injetável — a suíte de unit roda sem
 * IA no ar. Falha da IA propaga como Error comum; a rota traduz para 502.
 */
import {
  ForbiddenError,
  NotFoundError,
  buildTechnicalReportDraftPrompt,
  canActorManageTechnicalReportDecision,
  civilDayOfInstant,
  invalidTechnicalReportTypeError,
  isTechnicalReportType,
  technicalReportDocumentPeriod,
  type TechnicalReportType,
} from "@/backend/domain";
import type { TechnicalReportAccessPort } from "@/backend/modules/reporting/application/ports/technical-report-access.port";
import type { TechnicalReportGenerationPort } from "@/backend/modules/reporting/application/ports/technical-report-generation.port";
import type { ReportDraftPort } from "@/backend/modules/reporting/application/ports/report-draft.port";
import type { TechnicalReportSourcesPort } from "@/backend/modules/reporting/application/ports/technical-report-sources.port";
import { TECHNICAL_REPORT_DENIED_MESSAGE } from "@/backend/modules/reporting/application/use-cases/upsert-technical-report-content.use-case";

export interface DraftTechnicalReportCommand {
  projectId: number;
  actorId: number;
  actorRoles: string[];
  type: string;
  /** O instantâneo da geração vem do chamador (regra da casa: `now` é parâmetro). */
  now: Date;
}

export interface DraftTechnicalReportResult {
  draft: string;
}

export class DraftTechnicalReportUseCase {
  constructor(
    private readonly ports: {
      access: TechnicalReportAccessPort;
      generation: TechnicalReportGenerationPort;
      sources: TechnicalReportSourcesPort;
      draft: ReportDraftPort;
    },
  ) {}

  async execute(command: DraftTechnicalReportCommand): Promise<DraftTechnicalReportResult> {
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

    const context = await this.ports.generation.findProjectContext(command.projectId);
    if (!context) {
      throw new NotFoundError("Projeto não encontrado");
    }

    const period = technicalReportDocumentPeriod(context, civilDayOfInstant(command.now));
    const [sessions, tasks, activities] = await Promise.all([
      this.ports.sources.listSessionLogs(command.projectId, period.periodoInicio, period.periodoFim),
      this.ports.sources.listProjectTasks(command.projectId),
      // Meses do mesmo período: `AAAA-MM` é prefixo da data civil (DEC-156/132).
      this.ports.sources.listCronogramaActivities(
        command.projectId,
        period.periodoInicio.slice(0, 7),
        period.periodoFim.slice(0, 7),
      ),
    ]);

    const prompt = buildTechnicalReportDraftPrompt({
      project: {
        name: context.name,
        proppiNumber: context.proppiNumber,
        leaderName: context.leaderName,
      },
      type,
      period,
      sessions,
      tasks,
      activities,
    });

    const draft = await this.ports.draft.generateDraft(prompt);
    return { draft };
  }
}