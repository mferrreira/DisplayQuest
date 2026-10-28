// @vitest-environment node
/**
 * V5-10a (DEC-75/130/170/171) — G4 roundtrip do atestado contra o banco de teste
 * ISOLADO (127.0.0.1:5433 — nunca a 5432).
 *
 * Wiring real, sem mocks: módulo `attestation` REAL sobre os adapters Prisma reais e o
 * adaptador AcroForm REAL (o byte do oficial é gerado de verdade, achato incluído).
 * O que este arquivo mede:
 *   1. o trio (projeto, membro, mês) é único de verdade: regenerar atualiza a MESMA
 *      linha e a chave derivada é a prometida (DEC-170);
 *   2. o gate self OU gestão (DEC-171) contra dados reais: líder gera, gestão de
 *      membership gera, o próprio membro gera o seu, global sem membership gera, e o
 *      quirk da ACL — membership [VOLUNTARIO] com COORDENADOR global — NÃO gera para
 *      terceiro;
 *   3. mês inválido e membro fora do projeto recusam antes de qualquer escrita;
 *   4. o byte entregue é o oficial preenchido e ACHATADO (sem AcroForm no arquivo);
 *   5. as FKs prometidas na DEC-170: apagar o MEMBRO apaga o atestado (Cascade — o
 *      documento é regenerável e não bloqueia a conta), apagar quem GEROU mantém a
 *      linha com `generatedBy` nulo (SetNull), e apagar o projeto apaga tudo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { createAttestationModule } from "@/backend/modules/attestation";
import { ForbiddenError, NotFoundError } from "@/backend/domain";
import { PrismaAttestationSources } from "@/backend/modules/attestation/infrastructure/repositories/prisma-attestation-sources";

const stamp = Date.now();
const attestation = createAttestationModule();

let projectId = 0;
let leaderId = 0; // líder sem membership (PESQUISADOR)
let gestorId = 0; // membership [GERENTE_PROJETO]
let membroId = 0; // membership [VOLUNTARIO] — o atestadoado
let voluntarioGlobalId = 0; // membership [VOLUNTARIO] + COORDENADOR global — o quirk
let globalSemMembershipId = 0; // COORDENADOR global sem vínculo
const createdUserIds: number[] = [];

async function createUser(name: string, roles: UserRole[], cpf: string | null = null): Promise<number> {
  const user = await prisma.users.create({
    data: {
      name: `G4 Atestado ${name} ${stamp}`,
      email: `g4-atestado-${name.toLowerCase()}-${stamp}@test.local`,
      password: "g4-dummy-hash",
      status: "active",
      roles,
      cpf,
    },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user.id;
}

async function addMembership(userId: number, roles: UserRole[], cargaHoraria: number | null = null) {
  await prisma.project_members.create({
    data: { projectId, userId, roles, categoria: "BOLSISTA", cargaHoraria, dataEntrada: "2026-02-01" },
  });
}

function generate(actorId: number, actorRoles: UserRole[], userId: number, month?: string) {
  return attestation.generateCertificate({
    projectId,
    actorId,
    actorRoles,
    userId,
    month,
    now: new Date("2026-10-19T15:00:00-03:00"), // data civil 19/10 → mês default 2026-09
  });
}

describe("G4 roundtrip — atestado de frequência (isolated test DB)", () => {
  beforeAll(async () => {
    leaderId = await createUser("Leader", ["PESQUISADOR"]);
    gestorId = await createUser("Gestor", ["PESQUISADOR"]);
    membroId = await createUser("Membro", ["PESQUISADOR"], "12345678901");
    voluntarioGlobalId = await createUser("VoluntarioGlobal", ["COORDENADOR"]);
    globalSemMembershipId = await createUser("GlobalSemVinculo", ["COORDENADOR"]);

    const project = await prisma.projects.create({
      data: {
        name: `G4 Atestado ${stamp}`,
        createdBy: leaderId,
        leaderId,
        createdAt: "2026-01-01",
        status: "active",
        editalNumber: "EDITAL 09/2026",
      },
      select: { id: true },
    });
    projectId = project.id;

    await addMembership(gestorId, ["GERENTE_PROJETO"], 20);
    await addMembership(membroId, ["VOLUNTARIO"], 8);
    await addMembership(voluntarioGlobalId, ["VOLUNTARIO"], null);
  });

  afterAll(async () => {
    // certificates cascadeia com o projeto e com o membro; generatedBy é SetNull.
    await prisma.work_sessions.deleteMany({ where: { projectId } });
    await prisma.projects.delete({ where: { id: projectId } });
    await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("líder gera: linha com chave derivada e o byte achatado do oficial", async () => {
    const { certificate, pdfBytes } = await generate(leaderId, ["PESQUISADOR"], membroId);

    expect(certificate.month).toBe("2026-09"); // mês anterior à geração (DEC-171)
    expect(certificate.blobKey).toBe(`projects/${projectId}/certificates/${membroId}/2026-09.pdf`);
    expect(certificate.generatedBy).toBe(leaderId);

    // O oficial preenchido: 2 páginas e NENHUM campo de formulário no arquivo entregue.
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getForm().getFields()).toHaveLength(0);

    const rows = await prisma.certificates.findMany({ where: { projectId } });
    expect(rows).toHaveLength(1);
  });

  it("busca sessões concluídas do membro no mês mesmo sem vínculo com task", async () => {
    const session = await prisma.work_sessions.create({
      data: {
        userId: membroId,
        userName: "Membro de teste",
        projectId,
        originalStartTime: new Date("2026-09-08T10:00:00.000Z"),
        startTime: new Date("2026-09-08T10:00:00.000Z"),
        endTime: new Date("2026-09-08T11:00:00.000Z"),
        duration: 3600,
        activity: "Catalogação de amostras",
        status: "completed",
      },
      select: { id: true },
    });
    const rows = await new PrismaAttestationSources().listCompletedSessionLogs(projectId, membroId, "2026-09");
    expect(rows).toContainEqual(expect.objectContaining({ activity: "Catalogação de amostras" }));
    await prisma.work_sessions.delete({ where: { id: session.id } });
  });

  it("regenerar o mesmo trio atualiza a MESMA linha (upsert, DEC-170)", async () => {
    const first = await prisma.certificates.findFirst({ where: { projectId, userId: membroId, month: "2026-09" } });
    expect(first).not.toBeNull();

    const { certificate } = await generate(gestorId, ["PESQUISADOR"], membroId, "2026-09");
    expect(certificate.id).toBe(first!.id);
    expect(certificate.generatedBy).toBe(gestorId); // quem gerou por último

    const rows = await prisma.certificates.findMany({ where: { projectId, month: "2026-09" } });
    expect(rows).toHaveLength(1);
  });

  it("o próprio membro gera o seu, mesmo sem gerenciar nada (DEC-171)", async () => {
    const { certificate } = await generate(membroId, ["PESQUISADOR"], membroId, "2026-08");
    expect(certificate.userId).toBe(membroId);
    expect(certificate.generatedBy).toBe(membroId);
  });

  it("gate contra dados reais: gestão de membership e global sem membership geram; o quirk não", async () => {
    await generate(gestorId, ["PESQUISADOR"], membroId, "2026-07");
    await generate(globalSemMembershipId, ["COORDENADOR"], membroId, "2026-06");

    // membership [VOLUNTARIO] + COORDENADOR global: membership vence, não gerencia (quirk).
    await expect(generate(voluntarioGlobalId, ["COORDENADOR"], membroId, "2026-05")).rejects.toThrow(ForbiddenError);
    const rows = await prisma.certificates.findMany({ where: { projectId, month: "2026-05" } });
    expect(rows).toHaveLength(0); // recusado antes de qualquer escrita
  });

  it("mês inválido e membro fora do projeto recusam com a frase congelada", async () => {
    await expect(generate(leaderId, ["PESQUISADOR"], membroId, "10/2026")).rejects.toThrow(
      "Mês de referência do atestado é inválido (use AAAA-MM)",
    );

    const outsider = await createUser("ForaDoProjeto", ["PESQUISADOR"]);
    await expect(generate(leaderId, ["PESQUISADOR"], outsider)).rejects.toThrow("Membro não encontrado no projeto");
  });

  it("listagem e findById pelo par (projeto, id) nos adapters reais", async () => {
    const list = await attestation.listCertificates({ projectId });
    expect(list.map((row) => row.month).sort()).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);

    const target = list.find((row) => row.month === "2026-09")!;
    const found = await attestation.getCertificateFile({
      projectId,
      certificateId: target.id,
      actorId: membroId,
      actorRoles: ["PESQUISADOR"], // self: baixa o próprio
    });
    expect(found.certificate.id).toBe(target.id);

    // id forjado em outro projeto: 404 (mesmo desenho do DOCX, DEC-167).
    await expect(
      attestation.getCertificateFile({
        projectId: projectId + 100000,
        certificateId: target.id,
        actorId: membroId,
        actorRoles: ["PESQUISADOR"],
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("apagar quem GEROU mantém o atestado com generatedBy nulo (SetNull, DEC-170)", async () => {
    const before = await prisma.certificates.findFirst({ where: { projectId, month: "2026-07" } });
    expect(before?.generatedBy).toBe(gestorId);

    await prisma.users.delete({ where: { id: gestorId } });

    const after = await prisma.certificates.findFirst({ where: { projectId, month: "2026-07" } });
    expect(after).not.toBeNull(); // o documento sobrevive a quem o emitiu
    expect(after!.generatedBy).toBeNull();
  });

  it("apagar o MEMBRO apaga os atestados dele (Cascade — documento regenerável, DEC-170)", async () => {
    await prisma.users.delete({ where: { id: membroId } });
    const rows = await prisma.certificates.findMany({ where: { projectId, userId: membroId } });
    expect(rows).toHaveLength(0);
  });

  it("apagar o projeto apaga os atestados (cascade da FK)", async () => {
    await prisma.projects.delete({ where: { id: projectId } });
    const rows = await prisma.certificates.findMany({ where: { projectId } });
    expect(rows).toHaveLength(0);
    // recria para o afterAll não falhar em id inexistente
    const project = await prisma.projects.create({
      data: {
        name: `G4 Atestado recriado ${stamp}`,
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
