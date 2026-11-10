// @vitest-environment node
/**
 * plan-v22 (S03, R1-R5) — G4 roundtrip do atestado de NOVEMBRO na 5433, com todos os dados
 * do caso real do dono (projeto Xakriabá, líder Joselice, membro Eleissa BOLSISTA carga 20,
 * IFNMG, seBolsista BAT-DI-SUP, atividades cobrindo 2026-11, sessões com as frases do diário).
 *
 * Wiring real, sem mocks: módulo `attestation` REAL sobre os adapters Prisma reais e o
 * adaptador AcroForm REAL. O que este arquivo mede:
 *   1. `generate()` devolve o registro upsert com a chave derivada do trio e o fileName slug;
 *   2. os avisos de campo faltante são só os que faltam de verdade (modalidade nula);
 *   3. o byte entregue é o oficial preenchido, 2 páginas, sem AcroForm no arquivo;
 *   4. o byte é escrito em `evidence/S03/nov.pdf` — o julgador (cmd do gate) lê a página e
 *     exige as grafias novas: corpo "Novembro/2026", assinatura capitalizada, SE BOLSISTA,
 *     orientador, IFNMG e a descrição completa do diário.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "@cantoo/pdf-lib";
import { prisma } from "@/lib/database/prisma";
import { createAttestationModule } from "@/backend/modules/attestation";

const attestation = createAttestationModule();

const PROJ_NAME = "Estratégias para o Aprendizado e Resgate da Cultura Xakriabá Através de Jogos digitais";
const FRASES = [
  "Zerou o jogo xakrilíngua e fez um relatório sobre as funcionalidades do jogo.",
  "Realizou a síntese do capítulo do livro Jogos Digitais.",
  "Estudo sobre javascript e desenvolvimento web como ferramentas de transição do jogo Xakrilíngua para Web.",
  "Assistiu a 2 documentários sobre os povos Xakriabá e realizou a śintese.",
  "Leitura de 4 artigos sobre os povos xakriabá e a entrega da síntese.",
  "Leitura dos resumos elaborados pelos voluntários sobre a cultura Xakriabá.",
  "Escrita inicial do roteiro do jogo.",
];

let projectId = 0;
let leaderId = 0;
let membroId = 0;

async function createUser(name: string, email: string, extra: Record<string, unknown> = {}): Promise<number> {
  const user = await prisma.users.create({
    data: {
      name,
      email,
      password: "g4-dummy-hash",
      status: "active",
      roles: ["PESQUISADOR"],
      ...extra,
    },
    select: { id: true },
  });
  return user.id;
}

describe("G4 roundtrip — atestado de novembro na 5433 (plan-v22, S03)", () => {
  beforeAll(async () => {
    // Idempotente: a limpeza do run anterior sai primeiro.
    const olds = await prisma.projects.findMany({ where: { name: PROJ_NAME }, select: { id: true } });
    for (const old of olds) {
      await prisma.work_sessions.deleteMany({ where: { projectId: old.id } });
      await prisma.projects.delete({ where: { id: old.id } });
    }

    leaderId = await createUser("Joselice Ferreira Lima", "g4-xakriaba-lider@test.local");
    membroId = await createUser("Eleissa Oliveira Pinheiro", "g4-xakriaba-membro@test.local", {
      cpf: "13590015659",
      registrationNumber: "192201",
      level: "GRADUACAO",
      scholarshipType: null,
      fundingAgency: "IFNMG",
      fundingAgencyOther: null,
      seBolsista: "BAT-DI-SUP",
    });

    const project = await prisma.projects.create({
      data: {
        name: PROJ_NAME,
        createdBy: leaderId,
        leaderId,
        createdAt: "2026-06-01",
        status: "active",
        editalNumber: "241/2026",
      },
      select: { id: true },
    });
    projectId = project.id;

    await prisma.project_members.create({
      data: {
        projectId,
        userId: membroId,
        roles: ["VOLUNTARIO"],
        categoria: "BOLSISTA",
        cargaHoraria: 20,
        situacao: "ATIVO",
        dataEntrada: "2026-06-01",
      },
    });

    const activities = [
      { description: "Coleta de dados", firstMonth: "2026-06", lastMonth: "2026-08", status: "DONE" },
      { description: "Revisão da literatura", firstMonth: "2026-09", lastMonth: "2026-10", status: "DONE" },
      { description: "Desenvolvimento do jogo Xakrilíngua Web", firstMonth: "2026-11", lastMonth: "2026-11", status: "DONE" },
      { description: "Testes com usuários", firstMonth: "2026-12", lastMonth: "2026-12", status: "OPEN" },
    ];
    for (const [index, activity] of activities.entries()) {
      await prisma.project_activities.create({
        data: { projectId, order: index + 1, ...activity },
      });
    }

    for (const [index, frase] of FRASES.entries()) {
      const day = `2026-11-0${index + 2}T12:00:00.000Z`;
      await prisma.work_sessions.create({
        data: {
          userId: membroId,
          userName: "Eleissa Oliveira Pinheiro",
          projectId,
          startTime: new Date(day),
          endTime: new Date(day),
          duration: 3600,
          status: "completed",
          dailyLog: { create: { userId: membroId, projectId, date: new Date(day), note: frase } },
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.work_sessions.deleteMany({ where: { projectId } });
    await prisma.projects.delete({ where: { id: projectId } });
    await prisma.users.deleteMany({ where: { id: { in: [leaderId, membroId] } } });
  });

  it("gera novembro com todos os dados: registro upsert, chave derivada, fileName slug", async () => {
    const { certificate, pdfBytes, warnings } = await attestation.generateCertificate({
      projectId,
      actorId: leaderId,
      actorRoles: ["PESQUISADOR"],
      userId: membroId,
      month: "2026-11",
      now: new Date("2026-11-10T12:00:00.000Z"), // data civil 10/11 — assinatura do caso
    });

    expect(certificate.month).toBe("2026-11");
    expect(certificate.blobKey).toBe(`projects/${projectId}/certificates/${membroId}/2026-11.pdf`);
    expect(certificate.fileName).toBe(
      "atestado-2026-11-estrategias-para-o-aprendizado-e-resgate-da-cultura-xakriaba.pdf",
    );
    expect(certificate.generatedBy).toBe(leaderId);

    // Só a modalidade falta de fato no caso; todo o resto tem fonte.
    expect(warnings).toEqual(["Modalidade"]);

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getForm().getFields()).toHaveLength(0);

    mkdirSync(join(process.cwd(), "evidence", "S03"), { recursive: true });
    writeFileSync(join(process.cwd(), "evidence", "S03", "nov.pdf"), pdfBytes);
  });

  it("regenerar o mesmo trio atualiza a MESMA linha (upsert, DEC-170)", async () => {
    const first = await prisma.certificates.findFirst({ where: { projectId, userId: membroId, month: "2026-11" } });
    expect(first).not.toBeNull();

    const { certificate } = await attestation.generateCertificate({
      projectId,
      actorId: membroId,
      actorRoles: ["PESQUISADOR"],
      userId: membroId,
      month: "2026-11",
      now: new Date("2026-11-10T12:00:00.000Z"),
    });

    expect(certificate.id).toBe(first!.id);
    expect(certificate.generatedBy).toBe(membroId); // o próprio membro tem o direito (DEC-171)
    const rows = await prisma.certificates.findMany({ where: { projectId, month: "2026-11" } });
    expect(rows).toHaveLength(1);
  });
});
