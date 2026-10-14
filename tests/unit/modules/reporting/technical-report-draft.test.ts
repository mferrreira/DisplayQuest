/**
 * V5-9c (DEC-139/152/168) — use case do rascunho de IA, congelado antes do código.
 *
 * Ordem de recusa igual à da geração (404 projeto → 403 gate → 400 tipo) — o rascunho
 * NÃO exige texto salvo nem membros (é o ponto de partida, não o documento). A janela
 * das fontes é o período do relatório (DEC-167): `from`/`to` civis e meses `AAAA-MM`
 * derivados pelo domínio, o adaptador só filtra. Falha da IA propaga como Error comum
 * (a rota traduz para 502 — não é DomainError).
 */
import { describe, expect, it } from "vitest";

import { ForbiddenError, ValidationError } from "@/backend/domain";
import { DraftTechnicalReportUseCase } from "@/backend/modules/reporting/application/use-cases/draft-technical-report.use-case";
import type { TechnicalReportAccessPort } from "@/backend/modules/reporting/application/ports/technical-report-access.port";
import type { TechnicalReportGenerationPort } from "@/backend/modules/reporting/application/ports/technical-report-generation.port";
import type { ReportDraftPort } from "@/backend/modules/reporting/application/ports/report-draft.port";
import type { TechnicalReportSourcesPort } from "@/backend/modules/reporting/application/ports/technical-report-sources.port";

const DENIED_MESSAGE = "Usuário não tem permissão para editar o relatório técnico deste projeto";

function accessPort(overrides: { exists?: boolean; leaderId?: number | null; membershipRoles?: string[] | null } = {}): TechnicalReportAccessPort {
  const { exists = true, leaderId = 7, membershipRoles = null } = overrides;
  return {
    async findProjectAccess(projectId, actorId) {
      if (!exists) return null;
      return { projectId, leaderId, membershipRoles: actorId === null ? null : membershipRoles };
    },
  };
}

const CONTEXT = {
  projectId: 3,
  name: "IA no campo",
  createdAt: "2026-02-01",
  startDate: "2026-03-01",
  endDate: "2026-12-31",
  proppiNumber: "PROPPI-2026-017",
  leaderId: 7,
  leaderName: "Profa. Ana Souza",
};

function generationPort(): TechnicalReportGenerationPort {
  return {
    async findProjectContext() {
      return CONTEXT;
    },
    async listActiveMembers() {
      return []; // o rascunho não usa membros
    },
  };
}

function sourcesPort(): TechnicalReportSourcesPort & {
  calls: { from: string; to: string; fromMonth: string; toMonth: string }[];
} {
  const calls: { from: string; to: string; fromMonth: string; toMonth: string }[] = [];
  return {
    calls,
    async listSessionLogs(_projectId, from, to) {
      calls.push({ from, to, fromMonth: "", toMonth: "" });
      return [{ date: "2026-05-10", userName: "Bento Lima", activity: "Revisão bibliográfica", duration: 3.5, location: null }];
    },
    async listProjectTasks() {
      return [{ title: "Montar o dataset", status: "done", completedAt: "2026-06-02", points: 15 }];
    },
    async listCronogramaActivities(_projectId, fromMonth, toMonth) {
      calls.push({ from: "", to: "", fromMonth, toMonth });
      return [{ description: "Levantamento bibliográfico", firstMonth: "2026-03", lastMonth: "2026-05", status: "DONE", evidenceCount: 2 }];
    },
  };
}

function draftPort(overrides: { fail?: boolean } = {}): ReportDraftPort & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    async generateDraft(prompt) {
      prompts.push(prompt);
      if (overrides.fail) {
        throw new Error("IA indisponível: HTTP 502");
      }
      return "Descrição das Atividades\nExecutamos a revisão bibliográfica.";
    },
  };
}

async function draft(ports: {
  access?: TechnicalReportAccessPort;
  sources?: TechnicalReportSourcesPort;
  draft?: ReportDraftPort;
  actorId?: number;
  actorRoles?: string[];
  type?: string;
}) {
  const useCase = new DraftTechnicalReportUseCase({
    access: ports.access ?? accessPort(),
    generation: generationPort(),
    sources: ports.sources ?? sourcesPort(),
    draft: ports.draft ?? draftPort(),
  });
  return useCase.execute({
    projectId: 3,
    actorId: ports.actorId ?? 7, // líder
    actorRoles: ports.actorRoles ?? [],
    type: ports.type ?? "parcial",
    now: new Date("2026-10-14T21:00:00-03:00"),
  });
}

describe("rascunho de IA do relatório técnico (V5-9c, DEC-139/152)", () => {
  it("líder rascunha: o prompt vai montado com as fontes e o texto volta", async () => {
    const ai = draftPort();
    const result = await draft({ draft: ai });

    expect(ai.prompts).toHaveLength(1);
    expect(ai.prompts[0]).toContain("IA no campo");
    expect(ai.prompts[0]).toContain("Revisão bibliográfica");
    expect(ai.prompts[0]).toContain("Montar o dataset");
    expect(ai.prompts[0]).toContain("Levantamento bibliográfico");
    expect(result.draft).toBe("Descrição das Atividades\nExecutamos a revisão bibliográfica.");
  });

  it("a janela das fontes é o período do relatório cortado na geração (DEC-167)", async () => {
    const sources = sourcesPort();
    await draft({ sources });

    // sessão: início startDate, fim hoje (endDate 31/12 ainda não chegou)
    expect(sources.calls[0]).toEqual({ from: "2026-03-01", to: "2026-10-14", fromMonth: "", toMonth: "" });
    // cronograma: meses do mesmo período
    expect(sources.calls[1]).toEqual({ from: "", to: "", fromMonth: "2026-03", toMonth: "2026-10" });
  });

  it("outsider leva 403 com a MESMA frase, e com tipo inválido também 403 antes do 400", async () => {
    await expect(
      draft({
        access: accessPort({ leaderId: 7, membershipRoles: ["VOLUNTARIO"] }),
        actorId: 8,
        actorRoles: ["PESQUISADOR"],
      }),
    ).rejects.toThrow(new ForbiddenError(DENIED_MESSAGE));

    await expect(
      draft({
        access: accessPort({ leaderId: 7, membershipRoles: ["VOLUNTARIO"] }),
        actorId: 8,
        actorRoles: ["PESQUISADOR"],
        type: "mensal",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("projeto ausente é 404 antes do gate", async () => {
    await expect(draft({ access: accessPort({ exists: false }) })).rejects.toThrow("Projeto não encontrado");
  });

  it("tipo fora da lista é 400 com a MESMA frase do upsert", async () => {
    await expect(draft({ type: "mensal" })).rejects.toThrow(ValidationError);
    await expect(draft({ type: "mensal" })).rejects.toThrow(
      'Tipo de relatório técnico inválido: use "parcial", "tecnico-final" ou "final"',
    );
  });

  it("falha da IA propaga como Error comum — a rota traduz para 502, não 500 legado", async () => {
    await expect(draft({ draft: draftPort({ fail: true }) })).rejects.toThrow("IA indisponível: HTTP 502");
  });
});
