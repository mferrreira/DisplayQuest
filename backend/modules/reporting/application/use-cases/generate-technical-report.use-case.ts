/**
 * GenerateTechnicalReportUseCase — geração lote do DOCX oficial preenchido
 * (V5-9b, DEC-129/139/167/168).
 *
 * Ordem das recusas medida pela casa (404 → 403 → 400 → 409): projeto ausente, gate
 * "gestão/líder" (a mesma frase do upsert), tipo fora da lista (a mesma frase do upsert —
 * `invalidTechnicalReportTypeError`), e nenhum membro ATIVO (lote de zero arquivos não é
 * sucesso — 409).
 *
 * V5-14 (DEC-173, feedback do dono): gerar NÃO exige texto salvo. Sem registro, o slot
 * editável nasce vazio (`upsert` de conteúdo `""`) e o documento sai PRÉ-PREENCHIDO —
 * cabeçalho, período, pessoas e checkboxes certos, as três tabelas vazias para escrever
 * à mão (DEC-168 já congela "seção sem corpo fica vazia"). O caminho da IA (rascunho) e o
 * do documento em branco são as duas portas do mesmo texto editável (DEC-139).
 *
 * O use case monta os 17 comandos com as funções puras do domínio, renderiza pela porta
 * `TechnicalReportDocumentPort` e devolve os bytes à rota. Quem escreve no bucket é a
 * rota, pelo seam `lib/storage/blob-store.ts` (DEC-133) — o módulo não conhece bucket.
 * A chave é derivada (DEC-167): regenerar sobrescreve, e o documento reflete sempre o
 * texto salvo mais recente.
 */
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  buildTechnicalReportCommands,
  canActorManageTechnicalReportDecision,
  civilDayOfInstant,
  invalidTechnicalReportTypeError,
  isTechnicalReportType,
  technicalReportFileKey,
  technicalReportFileName,
  type TechnicalReportType,
} from "@/backend/domain";
import type { TechnicalReportAccessPort } from "@/backend/modules/reporting/application/ports/technical-report-access.port";
import type { TechnicalReportDocumentPort } from "@/backend/modules/reporting/application/ports/technical-report-document.port";
import type { TechnicalReportGenerationPort } from "@/backend/modules/reporting/application/ports/technical-report-generation.port";
import type {
  TechnicalReportRecord,
  TechnicalReportsRepository,
} from "@/backend/modules/reporting/application/ports/technical-reports.repository";
import { TECHNICAL_REPORT_DENIED_MESSAGE } from "@/backend/modules/reporting/application/use-cases/upsert-technical-report-content.use-case";

export interface GenerateTechnicalReportCommand {
  projectId: number;
  actorId: number;
  actorRoles: string[];
  type: string;
  /** O instantâneo da geração vem do chamador; a data civil é derivada aqui (regra da casa). */
  now: Date;
}

export interface GeneratedTechnicalReportFile {
  userId: number;
  memberName: string;
  /** Chave derivada no bucket (DEC-167) — a rota escreve exatamente aqui. */
  key: string;
  fileName: string;
  bytes: Uint8Array;
}

export interface GenerateTechnicalReportResult {
  report: TechnicalReportRecord;
  files: GeneratedTechnicalReportFile[];
}

export const TECHNICAL_REPORT_NO_MEMBERS_MESSAGE =
  "O projeto não tem membros ativos — o relatório é gerado um documento por membro";

export class GenerateTechnicalReportUseCase {
  constructor(
    private readonly ports: {
      technicalReports: TechnicalReportsRepository;
      access: TechnicalReportAccessPort;
      generation: TechnicalReportGenerationPort;
      docx: TechnicalReportDocumentPort;
    },
  ) {}

  async execute(
    command: GenerateTechnicalReportCommand,
  ): Promise<GenerateTechnicalReportResult> {
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

    // V5-14 (DEC-173): sem texto salvo não é recusa — o slot editável nasce vazio e o
    // documento sai pré-preenchido com as tabelas em branco. O id do registro continua na
    // chave derivada (DEC-167): regenerar sobrescreve o mesmo objeto.
    let report = await this.ports.technicalReports.findByProjectAndType(command.projectId, type);
    if (!report) {
      report = await this.ports.technicalReports.upsert(command.projectId, type, "");
    }

    const context = await this.ports.generation.findProjectContext(command.projectId);
    if (!context) {
      throw new NotFoundError("Projeto não encontrado");
    }

    const members = await this.ports.generation.listActiveMembers(command.projectId);
    if (members.length === 0) {
      throw new ConflictError(TECHNICAL_REPORT_NO_MEMBERS_MESSAGE);
    }

    const now = civilDayOfInstant(command.now);
    const files: GeneratedTechnicalReportFile[] = [];
    for (const member of members) {
      const commands = buildTechnicalReportCommands({
        project: {
          name: context.name,
          createdAt: context.createdAt,
          startDate: context.startDate,
          endDate: context.endDate,
          proppiNumber: context.proppiNumber,
          leaderName: context.leaderName,
        },
        member,
        type,
        content: report.content,
        now,
      });
      const bytes = await this.ports.docx.render(commands);
      files.push({
        userId: member.userId,
        memberName: member.name,
        key: technicalReportFileKey(command.projectId, report.id, member.userId),
        fileName: technicalReportFileName(type, member.name),
        bytes,
      });
    }

    return { report, files };
  }
}
