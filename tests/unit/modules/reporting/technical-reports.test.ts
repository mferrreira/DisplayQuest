/**
 * V5-9 (DEC-70/139/167) — use cases do relatório técnico, comportamento congelado antes
 * do código (PLAN §7). O que fica preso aqui:
 *   1. Leitura é a do autenticado (filho de projeto herda a leitura aberta, regra 13 do
 *      plano) — outsider lista; projeto ausente é 404.
 *   2. Escrita obedece ao par "gestão/líder" (DEC-139) com a ordem medida da casa:
 *      404 projeto → 403 gate → 400 corpo (quem não pode recebe o 403 mesmo com corpo
 *      inválido — lição B6-2b).
 *   3. O par (projeto, tipo) é único: upsert cria na primeira vez e atualiza o conteúdo
 *      nas seguintes (DEC-70 "um registro editável por par").
 *   4. O quirk da ACL vale igual: membership [VOLUNTARIO] com COORDENADOR global não
 *      edita; líder edita mesmo com membership de voluntário.
 */
import { describe, expect, it } from "vitest";

import { ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain";
import { ListTechnicalReportsUseCase } from "@/backend/modules/reporting/application/use-cases/list-technical-reports.use-case";
import { UpsertTechnicalReportContentUseCase } from "@/backend/modules/reporting/application/use-cases/upsert-technical-report-content.use-case";
import type { TechnicalReportAccessPort } from "@/backend/modules/reporting/application/ports/technical-report-access.port";
import type {
  TechnicalReportRecord,
  TechnicalReportsRepository,
} from "@/backend/modules/reporting/application/ports/technical-reports.repository";

const DENIED_MESSAGE = "Usuário não tem permissão para editar o relatório técnico deste projeto";

class FakeRepository implements TechnicalReportsRepository {
  rows = new Map<string, TechnicalReportRecord>();

  private key(projectId: number, type: string) {
    return `${projectId}:${type}`;
  }

  async listByProject(projectId: number): Promise<TechnicalReportRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.projectId === projectId)
      .map((row) => ({ ...row })); // cópia: leitura devolve record vivo é o modo de falha medido no V5-3
  }

  async upsert(projectId: number, type: string, content: string): Promise<TechnicalReportRecord> {
    const key = this.key(projectId, type);
    const existing = this.rows.get(key);
    const record: TechnicalReportRecord = existing
      ? { ...existing, content, updatedAt: "2026-10-14T12:00:00.000Z" }
      : {
          id: this.rows.size + 1,
          projectId,
          type,
          content,
          createdAt: "2026-10-14T12:00:00.000Z",
          updatedAt: "2026-10-14T12:00:00.000Z",
        };
    this.rows.set(key, record);
    return { ...record };
  }
}

function accessPort(overrides: {
  exists?: boolean;
  leaderId?: number | null;
  membershipRoles?: string[] | null;
} = {}): TechnicalReportAccessPort {
  const { exists = true, leaderId = 7, membershipRoles = null } = overrides;
  return {
    async findProjectAccess(projectId, actorId) {
      if (!exists) return null;
      return { projectId, leaderId, membershipRoles };
    },
  };
}

function upsert(ports: {
  repo?: FakeRepository;
  access?: TechnicalReportAccessPort;
  projectId?: number;
  actorId?: number;
  actorRoles?: string[];
  type?: string;
  content?: string;
}) {
  const useCase = new UpsertTechnicalReportContentUseCase({
    technicalReports: ports.repo ?? new FakeRepository(),
    access: ports.access ?? accessPort(),
  });
  return useCase.execute({
    projectId: ports.projectId ?? 3,
    // Default: o líder do projeto (leaderId=7 no accessPort default) — os casos que
    // querem um ator sem poder passam actorId/actorRoles/membershipRoles explícitos.
    actorId: ports.actorId ?? 7,
    actorRoles: ports.actorRoles ?? [],
    type: ports.type ?? "parcial",
    content: ports.content ?? "Texto do relatório",
  });
}

describe("relatório técnico — use cases (V5-9, DEC-70/139)", () => {
  describe("ListTechnicalReportsUseCase — leitura aberta", () => {
    it("outsider lista os relatórios do projeto (leitura do autenticado)", async () => {
      const repo = new FakeRepository();
      await repo.upsert(3, "parcial", "Primeiro");
      const listResult = await new ListTechnicalReportsUseCase({
        technicalReports: repo,
        access: accessPort(),
      }).execute({ projectId: 3 });

      expect(listResult.reports).toHaveLength(1);
      expect(listResult.reports[0].content).toBe("Primeiro");
    });

    it("projeto ausente é 404", async () => {
      const listCase = new ListTechnicalReportsUseCase({
        technicalReports: new FakeRepository(),
        access: accessPort({ exists: false }),
      });
      await expect(listCase.execute({ projectId: 999 })).rejects.toThrow(NotFoundError);
      await expect(listCase.execute({ projectId: 999 })).rejects.toThrow("Projeto não encontrado");
    });
  });

  describe("UpsertTechnicalReportContentUseCase — escrita gestão/líder", () => {
    it("cria o registro do par e devolve o record", async () => {
      const repo = new FakeRepository();
      const { report } = await upsert({ repo, type: "parcial" });

      expect(report.projectId).toBe(3);
      expect(report.type).toBe("parcial");
      expect(report.content).toBe("Texto do relatório");
      expect(typeof report.createdAt).toBe("string");
    });

    it("o segundo upsert do MESMO par atualiza o conteúdo — um registro editável por par (DEC-70)", async () => {
      const repo = new FakeRepository();
      const created = await upsert({ repo, type: "final", content: "Primeira versão" });
      const updated = await upsert({ repo, type: "final", content: "Segunda versão" });

      expect(updated.report.id).toBe(created.report.id);
      expect(updated.report.content).toBe("Segunda versão");
      expect(await repo.listByProject(3)).toHaveLength(1);
    });

    it("líder edita mesmo com membership de voluntário (DEC-139)", async () => {
      const { report } = await upsert({
        access: accessPort({ leaderId: 8, membershipRoles: ["VOLUNTARIO"] }),
        actorId: 8,
      });
      expect(report.content).toBe("Texto do relatório");
    });

    it("membership de gestor edita", async () => {
      const { report } = await upsert({
        access: accessPort({ leaderId: 7, membershipRoles: ["GERENTE_PROJETO"] }),
        actorId: 8,
      });
      expect(report.content).toBe("Texto do relatório");
    });

    it("global sem membership edita (fallback MANAGE_USERS da ACL)", async () => {
      const { report } = await upsert({
        access: accessPort({ leaderId: 7, membershipRoles: null }),
        actorId: 8,
        actorRoles: ["COORDENADOR"],
      });
      expect(report.content).toBe("Texto do relatório");
    });

    it("quirk da ACL: membership [VOLUNTARIO] com COORDENADOR global não edita", async () => {
      await expect(
        upsert({
          access: accessPort({ leaderId: 7, membershipRoles: ["VOLUNTARIO"] }),
          actorId: 8,
          actorRoles: ["COORDENADOR"],
        }),
      ).rejects.toThrow(DENIED_MESSAGE);
    });

    it("outsider sem papel leva 403 com a frase congelada", async () => {
      await expect(
        upsert({
          access: accessPort({ leaderId: 7, membershipRoles: ["VOLUNTARIO"] }),
          actorId: 8,
          actorRoles: ["PESQUISADOR"],
        }),
      ).rejects.toThrow(new ForbiddenError(DENIED_MESSAGE));
    });

    it("ordem medida: quem não pode recebe 403 ANTES do 400 de corpo (B6-2b)", async () => {
      await expect(
        upsert({
          access: accessPort({ leaderId: 7, membershipRoles: ["VOLUNTARIO"] }),
          actorId: 8,
          actorRoles: ["PESQUISADOR"],
          type: "mensal",
          content: 42 as unknown as string,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("projeto ausente é 404 antes do gate", async () => {
      await expect(
        upsert({ access: accessPort({ exists: false }), actorRoles: ["PESQUISADOR"] }),
      ).rejects.toThrow("Projeto não encontrado");
    });

    it("tipo fora da lista é recusado nomeando os permitidos", async () => {
      await expect(upsert({ type: "mensal" })).rejects.toThrow(ValidationError);
      await expect(upsert({ type: "mensal" })).rejects.toThrow(
        'Tipo de relatório técnico inválido: use "parcial", "tecnico-final" ou "final"',
      );
    });

    it("conteúdo que não é texto é recusado nomeando o campo", async () => {
      await expect(upsert({ content: 42 as unknown as string })).rejects.toThrow(
        "Conteúdo do relatório técnico é obrigatório",
      );
    });

    it("conteúdo vazio é aceito — a tabela do DOCX pode nascer vazia", async () => {
      const { report } = await upsert({ content: "" });
      expect(report.content).toBe("");
    });
  });
});
