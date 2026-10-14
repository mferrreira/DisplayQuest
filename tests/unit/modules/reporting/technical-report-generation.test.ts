/**
 * V5-9b (DEC-129/139/167/168) — use case de geração do DOCX, comportamento congelado
 * antes do código.
 *
 * O que fica preso aqui:
 *   1. Ordem medida da casa: 404 projeto → 403 gate → 400 tipo → 404 texto ausente →
 *      409 sem membros ATIVOS. Quem não pode recebe o 403 mesmo com corpo inválido.
 *   2. A geração é lote: um arquivo por membro ATIVO, chave derivada do par e do
 *      membro (regenerar sobrescreve), nome de exibição em slug.
 *   3. O use case renderiza pela PORTA (adaptador injetável — a suíte de unit roda sem
 *      template no ar? não: o template é asset versionado, mas o render é porta falsa
 *      aqui) e devolve os bytes à rota; quem move byte ao bucket é a rota (DEC-133).
 *   4. `now` é parâmetro: a data do relatório e o corte do período vêm do chamador,
 *      nunca de `new Date()` dentro da regra.
 */
import { describe, expect, it } from "vitest";

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain";
import { GenerateTechnicalReportUseCase } from "@/backend/modules/reporting/application/use-cases/generate-technical-report.use-case";
import type { TechnicalReportAccessPort } from "@/backend/modules/reporting/application/ports/technical-report-access.port";
import type { TechnicalReportDocumentPort } from "@/backend/modules/reporting/application/ports/technical-report-document.port";
import type {
  TechnicalReportGenerationPort,
  TechnicalReportMemberRow,
  TechnicalReportProjectContext,
} from "@/backend/modules/reporting/application/ports/technical-report-generation.port";
import type {
  TechnicalReportRecord,
  TechnicalReportsRepository,
} from "@/backend/modules/reporting/application/ports/technical-reports.repository";

const DENIED_MESSAGE = "Usuário não tem permissão para editar o relatório técnico deste projeto";
const NO_TEXT_MESSAGE = "Salve o texto do relatório antes de gerar o documento";
const NO_MEMBERS_MESSAGE = "O projeto não tem membros ativos — o relatório é gerado um documento por membro";

class FakeRepository implements TechnicalReportsRepository {
  rows = new Map<string, TechnicalReportRecord>();

  private key(projectId: number, type: string) {
    return `${projectId}:${type}`;
  }

  async listByProject(projectId: number): Promise<TechnicalReportRecord[]> {
    return [...this.rows.values()].filter((row) => row.projectId === projectId).map((row) => ({ ...row }));
  }

  async findByProjectAndType(projectId: number, type: string): Promise<TechnicalReportRecord | null> {
    const row = this.rows.get(this.key(projectId, type));
    return row ? { ...row } : null;
  }

  async upsert(projectId: number, type: string, content: string): Promise<TechnicalReportRecord> {
    const k = this.key(projectId, type);
    const existing = this.rows.get(k);
    const record: TechnicalReportRecord = existing
      ? { ...existing, content }
      : {
          id: this.rows.size + 1,
          projectId,
          type,
          content,
          createdAt: "2026-10-14T12:00:00.000Z",
          updatedAt: "2026-10-14T12:00:00.000Z",
        };
    this.rows.set(k, record);
    return { ...record };
  }
}

function accessPort(overrides: { exists?: boolean; leaderId?: number | null; membershipRoles?: string[] | null } = {}): TechnicalReportAccessPort {
  const { exists = true, leaderId = 7, membershipRoles = null } = overrides;
  return {
    async findProjectAccess(projectId, actorId) {
      if (!exists) return null;
      return { projectId, leaderId, membershipRoles: actorId === null ? null : membershipRoles };
    },
  };
}

const CONTEXT: TechnicalReportProjectContext = {
  projectId: 3,
  name: "IA no campo",
  createdAt: "2026-02-01",
  startDate: "2026-03-01",
  endDate: "2026-12-31",
  proppiNumber: "PROPPI-2026-017",
  leaderId: 7,
  leaderName: "Profa. Ana Souza",
};

function generationPort(overrides: {
  context?: TechnicalReportProjectContext | null;
  members?: TechnicalReportMemberRow[];
} = {}): TechnicalReportGenerationPort {
  const { context = CONTEXT, members = [
    { userId: 9, name: "Bento Lima", course: "Sistemas de Informação", scholarshipType: "PIBIC", fundingAgency: "CNPQ", fundingAgencyOther: null },
    { userId: 10, name: "Dina Raça", course: null, scholarshipType: null, fundingAgency: null, fundingAgencyOther: null },
  ] } = overrides;
  return {
    async findProjectContext() {
      return context;
    },
    async listActiveMembers() {
      return members.map((member) => ({ ...member }));
    },
  };
}

function fakeDocxPort(): TechnicalReportDocumentPort & { renders: Record<string, string>[] } {
  const renders: Record<string, string>[] = [];
  return {
    renders,
    async render(commands) {
      renders.push({ ...commands });
      return new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // assinatura ZIP — o fake devolve o mínimo
    },
  };
}

async function generate(ports: {
  repo?: FakeRepository;
  access?: TechnicalReportAccessPort;
  generation?: TechnicalReportGenerationPort;
  docx?: TechnicalReportDocumentPort;
  actorId?: number;
  actorRoles?: string[];
  type?: string;
}) {
  const repo = ports.repo ?? new FakeRepository();
  await repo.upsert(3, "parcial", "Descrição das Atividades\nEtapa 1 concluída.\nPrincipais Resultados\nArtigo submetido.");
  const useCase = new GenerateTechnicalReportUseCase({
    technicalReports: repo,
    access: ports.access ?? accessPort(),
    generation: ports.generation ?? generationPort(),
    docx: ports.docx ?? fakeDocxPort(),
  });
  return useCase.execute({
    projectId: 3,
    actorId: ports.actorId ?? 7, // default: o líder
    actorRoles: ports.actorRoles ?? [],
    type: ports.type ?? "parcial",
    now: new Date("2026-10-14T21:00:00-03:00"),
  });
}

describe("geração do DOCX do relatório técnico (V5-9b, DEC-129/139)", () => {
  it("lote: um arquivo por membro ATIVO, com chave derivada e nome em slug", async () => {
    const result = await generate({});

    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toMatchObject({
      userId: 9,
      memberName: "Bento Lima",
      key: "projects/3/technical-reports/1/9.docx",
      fileName: "relatorio-parcial-bento-lima.docx",
    });
    expect(result.files[1].key).toBe("projects/3/technical-reports/1/10.docx");
    expect(result.files[1].fileName).toBe("relatorio-parcial-dina-raca.docx");
    expect(result.files[0].bytes).toBeInstanceOf(Uint8Array);
    expect(result.report.type).toBe("parcial");
  });

  it("os comandos renderizados são os 17 da cópia marcada, com o corpo cortado nas tabelas (DEC-168)", async () => {
    const docx = fakeDocxPort();
    await generate({ docx });

    expect(docx.renders).toHaveLength(2);
    const first = docx.renders[0];
    expect(Object.keys(first)).toHaveLength(17);
    expect(first.titulo).toBe("IA no campo");
    expect(first.coordenador).toBe("Profa. Ana Souza");
    expect(first.orientador).toBe("Profa. Ana Souza");
    expect(first.proppi).toBe("PROPPI-2026-017");
    expect(first.periodo_inicio).toBe("01/03/2026");
    expect(first.periodo_fim).toBe("14/10/2026"); // hoje corta o período (fim contratual é 31/12)
    expect(first.data_relatorio).toBe("14/10/2026");
    expect(first.linha_tipo).toBe("( ) Relatório Final ( x ) Relatório Parcial");
    expect(first.estudante_nome).toBe("Bento Lima");
    expect(first.modalidade).toBe("PIBIC");
    expect(first.instituicao_fomento).toBe("CNPq");
    expect(first.tabela_descricao).toBe("Etapa 1 concluída.");
    expect(first.tabela_resultados).toBe("Artigo submetido.");
    expect(first.tabela_comentarios).toBe("");
    // membro sem dados: linhas em branco, não "null"
    expect(docx.renders[1].estudante_curso).toBe("");
    expect(docx.renders[1].modalidade).toBe("");
  });

  it("outsider leva 403 com a MESMA frase do upsert", async () => {
    await expect(
      generate({
        access: accessPort({ leaderId: 7, membershipRoles: ["VOLUNTARIO"] }),
        actorId: 8,
        actorRoles: ["PESQUISADOR"],
      }),
    ).rejects.toThrow(new ForbiddenError(DENIED_MESSAGE));
  });

  it("ordem medida: quem não pode recebe 403 ANTES do 400 de tipo (B6-2b)", async () => {
    await expect(
      generate({
        access: accessPort({ leaderId: 7, membershipRoles: ["VOLUNTARIO"] }),
        actorId: 8,
        actorRoles: ["PESQUISADOR"],
        type: "mensal",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("projeto ausente é 404 antes do gate", async () => {
    await expect(generate({ access: accessPort({ exists: false }) })).rejects.toThrow("Projeto não encontrado");
  });

  it("tipo fora da lista é 400 com a MESMA frase do upsert", async () => {
    await expect(generate({ type: "mensal" })).rejects.toThrow(ValidationError);
    await expect(generate({ type: "mensal" })).rejects.toThrow(
      'Tipo de relatório técnico inválido: use "parcial", "tecnico-final" ou "final"',
    );
  });

  it("sem texto salvo é 404 nomeando a exigência — e nada é renderizado", async () => {
    const docx = fakeDocxPort();
    const repo = new FakeRepository(); // sem upsert: o par não existe
    await expect(
      generate({ repo, docx, type: "final" }),
    ).rejects.toThrow(NO_TEXT_MESSAGE);
    expect(docx.renders).toHaveLength(0);
  });

  it("sem membro ATIVO é 409 — geração lote de zero arquivos não é sucesso", async () => {
    await expect(
      generate({ generation: generationPort({ members: [] }) }),
    ).rejects.toThrow(new ConflictError(NO_MEMBERS_MESSAGE));
  });
});
