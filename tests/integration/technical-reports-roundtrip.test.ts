// @vitest-environment node
/**
 * V5-9 (DEC-70/139/167) — G4 roundtrip do relatório técnico contra o banco de teste
 * ISOLADO (127.0.0.1:5433 — nunca a 5432).
 *
 * Wiring real, sem mocks: módulo de reporting REAL sobre os adapters Prisma reais
 * (tabela própria + leitura de projeto própria, RG-04). O que este arquivo mede:
 *   1. o par (projeto, tipo) é único de verdade: o segundo upsert atualiza o MESMO
 *      registro (DEC-70 "um registro editável por par") e a tabela tem uma linha;
 *   2. o gate "gestão/líder" (DEC-139) contra dados reais: líder edita, membership de
 *      gestor edita, global sem membership edita, e o quirk da ACL — membership
 *      [VOLUNTARIO] com COORDENADOR global — não edita;
 *   3. tipo fora da lista é recusado antes de qualquer escrita;
 *   4. apagar o projeto apaga os relatórios (cascade da FK);
 *   5. (V5-9b) a geração lote roda com o adaptador docx REAL sobre dados reais: um
 *      arquivo por membro ATIVO, o INATIVO fica fora, e a chave derivada é a prometida.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { createReportingModule } from "@/backend/modules/reporting";
import { ForbiddenError, ValidationError } from "@/backend/domain";

const stamp = Date.now();
const reporting = createReportingModule();

let projectId = 0;
let leaderId = 0; // líder do projeto (PESQUISADOR sem membership)
let gestorId = 0; // membership [GERENTE_PROJETO]
let voluntarioGlobalId = 0; // membership [VOLUNTARIO] + COORDENADOR global — o quirk
let globalSemMembershipId = 0; // COORDENADOR global sem vínculo
let outsiderId = 0; // PESQUISADOR sem vínculo
const createdUserIds: number[] = [];

async function createUser(name: string, roles: UserRole[]): Promise<number> {
  const user = await prisma.users.create({
    data: {
      name: `G4 TecRep ${name} ${stamp}`,
      email: `g4-tecrep-${name.toLowerCase()}-${stamp}@test.local`,
      password: "g4-dummy-hash",
      status: "active",
      roles,
    },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user.id;
}

describe("G4 roundtrip — relatório técnico (isolated test DB)", () => {
  beforeAll(async () => {
    leaderId = await createUser("Leader", ["PESQUISADOR"]);
    gestorId = await createUser("Gestor", ["PESQUISADOR"]);
    voluntarioGlobalId = await createUser("VoluntarioGlobal", ["COORDENADOR"]);
    globalSemMembershipId = await createUser("GlobalSemVinculo", ["COORDENADOR"]);
    outsiderId = await createUser("Outsider", ["PESQUISADOR"]);

    const project = await prisma.projects.create({
      // `createdAt` é data civil String obrigatória (DEC-132) e `createdBy` é FK obrigatória.
      data: {
        name: `G4 TecRep ${stamp}`,
        createdBy: leaderId,
        leaderId,
        createdAt: "2026-01-01",
        status: "active",
      },
      select: { id: true },
    });
    projectId = project.id;

    for (const [userId, roles] of [
      [gestorId, ["GERENTE_PROJETO"]],
      [voluntarioGlobalId, ["VOLUNTARIO"]],
    ] as Array<[number, UserRole[]]>) {
      await prisma.project_members.create({
        data: { projectId, userId, roles },
      });
    }
  });

  afterAll(async () => {
    // technical_reports cascadeia com o projeto; project_members cascadeia também.
    await prisma.projects.delete({ where: { id: projectId } });
    await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("líder cria o par, membership de gestor atualiza o MESMO registro (DEC-70)", async () => {
    const created = await reporting.upsertTechnicalReportContent({
      projectId,
      actorId: leaderId,
      actorRoles: ["PESQUISADOR"],
      type: "parcial",
      content: "Versão do líder",
    });
    expect(created.report.content).toBe("Versão do líder");

    const updated = await reporting.upsertTechnicalReportContent({
      projectId,
      actorId: gestorId,
      actorRoles: ["PESQUISADOR"],
      type: "parcial",
      content: "Versão do gestor",
    });
    expect(updated.report.id).toBe(created.report.id);
    expect(updated.report.content).toBe("Versão do gestor");

    // Uma linha por par — a constraint única é o "registro editável por par".
    const rows = await prisma.technical_reports.findMany({ where: { projectId } });
    expect(rows).toHaveLength(1);

    const { reports } = await reporting.listTechnicalReports({ projectId });
    expect(reports).toHaveLength(1);
    expect(reports[0].content).toBe("Versão do gestor");
  });

  it("tipos diferentes são pares diferentes", async () => {
    await reporting.upsertTechnicalReportContent({
      projectId,
      actorId: leaderId,
      actorRoles: ["PESQUISADOR"],
      type: "final",
      content: "Final",
    });
    const { reports } = await reporting.listTechnicalReports({ projectId });
    expect(reports.map((row) => row.type).sort()).toEqual(["final", "parcial"]);
  });

  it("quirk da ACL com dado real: membership [VOLUNTARIO] + COORDENADOR global não edita", async () => {
    await expect(
      reporting.upsertTechnicalReportContent({
        projectId,
        actorId: voluntarioGlobalId,
        actorRoles: ["COORDENADOR"],
        type: "parcial",
        content: "não deveria entrar",
      }),
    ).rejects.toThrow(ForbiddenError);

    const rows = await prisma.technical_reports.findMany({
      where: { projectId, type: "parcial" },
    });
    expect(rows[0].content).toBe("Versão do gestor"); // nada foi escrito
  });

  it("global sem membership edita; outsider sem papel não", async () => {
    const { report } = await reporting.upsertTechnicalReportContent({
      projectId,
      actorId: globalSemMembershipId,
      actorRoles: ["COORDENADOR"],
      type: "tecnico-final",
      content: "Técnico-final global",
    });
    expect(report.content).toBe("Técnico-final global");

    await expect(
      reporting.upsertTechnicalReportContent({
        projectId,
        actorId: outsiderId,
        actorRoles: ["PESQUISADOR"],
        type: "parcial",
        content: "outsider",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("leitura é do autenticado: outsider lista os relatórios", async () => {
    const { reports } = await reporting.listTechnicalReports({ projectId });
    expect(reports.length).toBeGreaterThan(0);
  });

  it("tipo fora da lista é recusado e nenhuma linha é escrita", async () => {
    await expect(
      reporting.upsertTechnicalReportContent({
        projectId,
        actorId: leaderId,
        actorRoles: ["PESQUISADOR"],
        type: "mensal",
        content: "X",
      }),
    ).rejects.toThrow(ValidationError);
    const rows = await prisma.technical_reports.findMany({ where: { projectId, type: "mensal" } });
    expect(rows).toHaveLength(0);
  });

  it("geração lote real: um DOCX por membro ATIVO, INATIVO fica fora (DEC-167)", async () => {
    const bolsistaId = await createUser("Bolsista", ["VOLUNTARIO"]);
    const inativoId = await createUser("Inativo", ["VOLUNTARIO"]);
    await prisma.users.update({
      where: { id: bolsistaId },
      data: { course: "Sistemas de Informação", scholarshipType: "PIBIC", fundingAgency: "CNPQ" },
    });
    await prisma.project_members.create({
      data: { projectId, userId: bolsistaId, roles: ["VOLUNTARIO"], situacao: "ATIVO" },
    });
    await prisma.project_members.create({
      data: { projectId, userId: inativoId, roles: ["VOLUNTARIO"], situacao: "INATIVO" },
    });

    // Adaptador docx REAL (asset versionado, sem bucket): o roundtrip exercita o wiring
    // inteiro — tabela, leitura de projeto própria, membros ATIVO e render.
    const { report, files } = await reporting.generateTechnicalReport({
      projectId,
      actorId: leaderId,
      actorRoles: ["PESQUISADOR"],
      type: "parcial",
      now: new Date("2026-10-14T21:00:00-03:00"),
    });

    expect(report.content).toBe("Versão do gestor");

    // gestor + voluntarioGlobal + bolsista são ATIVO; o INATIVO não recebe documento.
    const userIds = files.map((file) => file.userId).sort((a, b) => a - b);
    expect(userIds).toEqual([gestorId, voluntarioGlobalId, bolsistaId].sort((a, b) => a - b));
    expect(userIds).not.toContain(inativoId);

    const bolsista = files.find((file) => file.userId === bolsistaId)!;
    expect(bolsista.key).toBe(`projects/${projectId}/technical-reports/${report.id}/${bolsistaId}.docx`);
    expect(bolsista.fileName).toBe(`relatorio-parcial-g4-tecrep-bolsista-${stamp}.docx`);
    // bytes do adaptador real: assinatura ZIP na cabeça de cada arquivo.
    for (const file of files) {
      expect([...file.bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    }
  });

  it("rascunho real: as três fontes chegam ao prompt e sessão fora do período fica fora (V5-9c)", async () => {
    // Fontes REAIS (Prisma), IA falsa (porta injetável — DEC-152: teste nunca toca a IA).
    const prompts: string[] = [];
    const reportingComIAFalsa = createReportingModule({
      ports: {
        reportDraft: {
          async generateDraft(prompt) {
            prompts.push(prompt);
            return "Descrição das Atividades\nRascunho do roundtrip.";
          },
        },
      },
    });

    const bolsista = await prisma.users.findFirst({
      where: { email: { contains: `g4-tecrep-bolsista-${stamp}` } },
      select: { id: true, name: true },
    });
    expect(bolsista).not.toBeNull();

    await prisma.work_sessions.create({
      data: {
        userId: bolsista!.id,
        userName: bolsista!.name,
        projectId,
        startTime: new Date("2026-05-10T12:00:00.000Z"), // dentro do período (jan/2026–hoje)
        activity: "Revisão bibliográfica real",
        duration: 3.5,
        status: "completed",
      },
    });
    await prisma.work_sessions.create({
      data: {
        userId: bolsista!.id,
        userName: bolsista!.name,
        projectId,
        startTime: new Date("2025-12-01T12:00:00.000Z"), // antes do projeto — fora
        activity: "Sessão fora do período",
        duration: 2,
        status: "completed",
      },
    });
    await prisma.tasks.create({
      data: {
        title: `G4 TecRep tarefa draft ${stamp}`,
        status: "done",
        priority: "medium",
        projectId,
        completed: true,
        completedAt: new Date("2026-06-02T12:00:00.000Z"),
        points: 15,
      },
    });
    await prisma.project_activities.create({
      data: {
        projectId,
        order: 99,
        description: `G4 TecRep etapa draft ${stamp}`,
        firstMonth: "2026-02",
        lastMonth: "2026-04",
      },
    });

    try {
      const { draft } = await reportingComIAFalsa.draftTechnicalReport({
        projectId,
        actorId: leaderId,
        actorRoles: ["PESQUISADOR"],
        type: "parcial",
        now: new Date("2026-10-14T21:00:00-03:00"),
      });
      expect(draft).toBe("Descrição das Atividades\nRascunho do roundtrip.");

      expect(prompts).toHaveLength(1);
      const prompt = prompts[0];
      // As três fontes, com dados reais do banco.
      expect(prompt).toContain("Revisão bibliográfica real");
      expect(prompt).toContain(`G4 TecRep tarefa draft ${stamp}`);
      expect(prompt).toContain(`G4 TecRep etapa draft ${stamp}`);
      expect(prompt).toContain("2026-02");
      // A janela é o período do relatório (DEC-167): sessão de 2025 não entra.
      expect(prompt).not.toContain("Sessão fora do período");
    } finally {
      // `work_sessions` e `tasks` NÃO cascadeiam com o projeto (Restrict) — o delete do
      // projeto no afterAll falharia se estas linhas ficassem.
      await prisma.work_sessions.deleteMany({ where: { projectId } });
      await prisma.tasks.deleteMany({ where: { projectId } });
    }
  });

  it("apagar o projeto apaga os relatórios (cascade)", async () => {
    await prisma.projects.delete({ where: { id: projectId } });
    const rows = await prisma.technical_reports.findMany({ where: { projectId } });
    expect(rows).toHaveLength(0);
    // recria para o afterAll não falhar em id inexistente
    const project = await prisma.projects.create({
      data: {
        name: `G4 TecRep recriado ${stamp}`,
        createdBy: leaderId,
        leaderId,
        createdAt: "2026-01-01",
        status: "active",
      },
      select: { id: true },
    });
    projectId = project.id;
  });
});
