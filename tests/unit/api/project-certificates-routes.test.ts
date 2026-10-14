// @vitest-environment node
/**
 * V5-10a (DEC-133/170/171) — rota tests de geração, listagem e download do atestado.
 *
 * Forma medida da casa (B6-2a): módulo REAL sobre portas falsas; só a sessão e o bucket
 * são dobrados. O que fica preso:
 *   - geração: 201 com put na CHAVE DERIVADA e mime PDF; self gera o próprio; outsider
 *     leva 403 com a frase congelada e NENHUM put nasce (o gate antes do objeto, DEC-133);
 *     404 projeto → 403 gate → 400 mês → 404 membro; 503 sem bucket com a MESMA frase.
 *   - lista: leitura aberta (outsider 200) e sem CPF no corpo — metadado só.
 *   - arquivo: self baixa 200 com o binário; outsider leva 403 ANTES do bucket (mesmo sem
 *     bucket configurado — o gate roda primeiro porque o PDF carrega o CPF); id forjado
 *     em outro projeto é 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createAttestationModule } from "@/backend/modules/attestation";
import type {
  CertificateRecord,
  CertificatesRepository,
} from "@/backend/modules/attestation/application/ports/certificates.repository";
import type { AttestationSourcesPort } from "@/backend/modules/attestation/application/ports/attestation-sources.port";
import type { AttestationPdfPort } from "@/backend/modules/attestation/application/ports/attestation-pdf.port";

const PDF_MIME = "application/pdf";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  projectExists: true,
  leaderId: 7,
  membershipRoles: null as string[] | null,
  memberExists: true,
  noBucket: false,
  puts: [] as Array<{ key: string; contentType: string; bytes: number }>,
  blobs: new Map<string, Uint8Array>(),
  renders: 0,
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, prop) => () => {
        throw new Error(`porta não deveria ser usada em teste: prisma.${String(prop)}`);
      },
    },
  ),
}));

vi.mock("@/lib/storage/blob-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage/blob-store")>("@/lib/storage/blob-store");
  const store = {
    async put(key: string, body: Uint8Array, contentType: string) {
      mocks.puts.push({ key, contentType, bytes: body.byteLength });
      mocks.blobs.set(key, body);
    },
    async get(key: string) {
      const body = mocks.blobs.get(key);
      if (!body) return null;
      return { key, body, size: body.byteLength, contentType: PDF_MIME };
    },
  };
  return {
    ...actual,
    blobStoreFromEnv: () => (mocks.noBucket ? null : store),
  };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

vi.mock("@/backend/composition/root", () => {
  const rows: CertificateRecord[] = [];

  const certificates: CertificatesRepository = {
    async upsert(input) {
      const existing = rows.find(
        (row) => row.projectId === input.projectId && row.userId === input.userId && row.month === input.month,
      );
      if (existing) {
        existing.blobKey = input.blobKey;
        existing.fileName = input.fileName;
        existing.generatedBy = input.generatedBy;
        return { ...existing };
      }
      const record: CertificateRecord = {
        id: rows.length + 1,
        projectId: input.projectId,
        userId: input.userId,
        month: input.month,
        blobKey: input.blobKey,
        fileName: input.fileName,
        generatedBy: input.generatedBy,
        createdAt: new Date("2026-10-19T12:00:00Z"),
        updatedAt: new Date("2026-10-19T12:00:00Z"),
      };
      rows.push(record);
      return { ...record };
    },
    async findByProject(projectId) {
      return rows.filter((row) => row.projectId === projectId).map((row) => ({ ...row }));
    },
    async findById(projectId, certificateId) {
      const row = rows.find((r) => r.projectId === projectId && r.id === certificateId);
      return row ? { ...row } : null;
    },
  };

  const sources: AttestationSourcesPort = {
    async findProjectContext(projectId) {
      if (!mocks.projectExists) return null;
      // Lido NA CHAMADA: os testes mudam leaderId/membershipRoles entre casos.
      return {
        projectId,
        name: "IA no campo",
        editalNumber: "EDITAL 09/2026",
        proppiNumber: null,
        leaderId: mocks.leaderId,
        actorMembershipRoles: mocks.membershipRoles,
      };
    },
    async findMemberContext(_projectId, userId) {
      if (!mocks.memberExists) return null;
      return {
        userId,
        name: "Bento Lima",
        cpf: "12345678901",
        registrationNumber: "2026123456",
        level: "GRADUACAO",
        scholarshipType: "PIBIC",
        fundingAgency: "CNPQ",
        fundingAgencyOther: null,
        categoria: "BOLSISTA",
        cargaHoraria: 8,
      };
    },
    async listScheduleActivities() {
      return [{ description: "Coleta de dados", firstMonth: "2026-09", lastMonth: "2026-10", status: "OPEN" }];
    },
  };

  const pdf: AttestationPdfPort = {
    async renderPdf() {
      mocks.renders += 1;
      return new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    },
  };

  return {
    getBackendComposition: () => ({
      attestation: createAttestationModule({ ports: { certificates, sources, pdf } }),
    }),
  };
});

import { GET as listGET, POST as generatePOST } from "@/app/api/projects/[id]/certificates/route";
import { GET as fileGET } from "@/app/api/projects/[id]/certificates/[certificateId]/file/route";

function login(roles: string[], id = 8) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function paramsOf<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

function postBody(body: unknown) {
  return new NextRequest("http://localhost:3001/api/projects/3/certificates", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.projectExists = true;
  mocks.leaderId = 7;
  mocks.membershipRoles = null;
  mocks.memberExists = true;
  mocks.noBucket = false;
  mocks.puts = [];
  mocks.blobs = new Map();
  mocks.renders = 0;
});

describe("POST /api/projects/[id]/certificates (V5-10a)", () => {
  it("gestão gera: 201, put na chave derivada com mime PDF", async () => {
    login(["COORDENADOR"], 7); // líder
    const response = await generatePOST(postBody({ userId: 9, month: "2026-09" }), paramsOf({ id: "3" }));
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.certificate.month).toBe("2026-09");
    expect(payload.certificate.fileName).toBe("atestado-2026-09-ia-no-campo.pdf");
    expect(mocks.puts).toEqual([
      { key: "projects/3/certificates/9/2026-09.pdf", contentType: PDF_MIME, bytes: 4 },
    ]);
  });

  it("o próprio membro gera o seu atestado", async () => {
    login(["PESQUISADOR"], 9);
    mocks.membershipRoles = ["VOLUNTARIO"];
    const response = await generatePOST(postBody({ userId: 9 }), paramsOf({ id: "3" }));
    expect(response.status).toBe(201);
  });

  it("outsider leva 403 com a frase congelada e NENHUM objeto nasce", async () => {
    login(["PESQUISADOR"], 8);
    mocks.membershipRoles = ["VOLUNTARIO"];
    const response = await generatePOST(postBody({ userId: 9 }), paramsOf({ id: "3" }));
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error).toBe("Usuário não tem permissão para gerar atestado de frequência neste projeto");
    expect(mocks.puts).toHaveLength(0);
    expect(mocks.renders).toBe(0);
  });

  it("404 projeto → 403 gate → 400 mês → 404 membro, na ordem", async () => {
    login(["PESQUISADOR"], 8);
    mocks.projectExists = false;
    expect((await generatePOST(postBody({ userId: 9 }), paramsOf({ id: "3" }))).status).toBe(404);

    mocks.projectExists = true;
    mocks.membershipRoles = ["COLABORADOR"];
    expect((await generatePOST(postBody({ userId: 9, month: "10/2026" }), paramsOf({ id: "3" }))).status).toBe(403);

    login(["COORDENADOR"], 7); // líder: passa o gate
    const monthResponse = await generatePOST(postBody({ userId: 9, month: "10/2026" }), paramsOf({ id: "3" }));
    expect(monthResponse.status).toBe(400);
    expect((await monthResponse.json()).error).toBe("Mês de referência do atestado é inválido (use AAAA-MM)");

    mocks.memberExists = false;
    const memberResponse = await generatePOST(postBody({ userId: 9 }), paramsOf({ id: "3" }));
    expect(memberResponse.status).toBe(404);
    expect((await memberResponse.json()).error).toBe("Membro não encontrado no projeto");
  });

  it("sem bucket é 503 com a MESMA frase das rotas de anexo/DOCX", async () => {
    login(["COORDENADOR"], 7);
    mocks.noBucket = true;
    const response = await generatePOST(postBody({ userId: 9 }), paramsOf({ id: "3" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET");
  });

  it("userId ausente ou não numérico é 400 de rota", async () => {
    login(["COORDENADOR"], 7);
    expect((await generatePOST(postBody({ month: "2026-09" }), paramsOf({ id: "3" }))).status).toBe(400);
    expect((await generatePOST(postBody({ userId: "abc" }), paramsOf({ id: "3" }))).status).toBe(400);
  });
});

describe("GET /api/projects/[id]/certificates (V5-10a)", () => {
  it("lista é leitura aberta e não expõe CPF — só metadado", async () => {
    login(["COORDENADOR"], 7);
    await generatePOST(postBody({ userId: 9, month: "2026-09" }), paramsOf({ id: "3" }));

    login(["PESQUISADOR"], 8); // outsider da gestão
    mocks.membershipRoles = ["VOLUNTARIO"];
    const response = await listGET(
      new NextRequest("http://localhost:3001/api/projects/3/certificates"),
      paramsOf({ id: "3" }),
    );
    expect(response.status).toBe(200);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("2026-09");
    expect(text).not.toContain("12345678901");
    expect(text).not.toContain("123.456.789-01");
  });
});

describe("GET /api/projects/[id]/certificates/[certificateId]/file (V5-10a)", () => {
  async function generateAsLeader() {
    login(["COORDENADOR"], 7);
    const response = await generatePOST(postBody({ userId: 9, month: "2026-09" }), paramsOf({ id: "3" }));
    return (await response.json()).certificate.id as number;
  }

  it("o próprio membro baixa o PDF com o nome de arquivo", async () => {
    const certificateId = await generateAsLeader();
    login(["PESQUISADOR"], 9);
    mocks.membershipRoles = ["VOLUNTARIO"];
    const response = await fileGET(
      new NextRequest(`http://localhost:3001/api/projects/3/certificates/${certificateId}/file`),
      paramsOf({ id: "3", certificateId: String(certificateId) }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(PDF_MIME);
    expect(response.headers.get("Content-Disposition")).toContain("atestado-2026-09-ia-no-campo.pdf");
  });

  it("outsider leva 403 ANTES do bucket — mesmo sem bucket configurado", async () => {
    const certificateId = await generateAsLeader();
    login(["PESQUISADOR"], 8);
    mocks.membershipRoles = ["VOLUNTARIO"];
    mocks.noBucket = true;
    const response = await fileGET(
      new NextRequest(`http://localhost:3001/api/projects/3/certificates/${certificateId}/file`),
      paramsOf({ id: "3", certificateId: String(certificateId) }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Usuário não tem permissão para acessar o atestado deste projeto");
  });

  it("id forjado (outro projeto ou inexistente) é 404", async () => {
    const certificateId = await generateAsLeader();
    login(["PESQUISADOR"], 9);
    mocks.membershipRoles = ["VOLUNTARIO"];
    const response = await fileGET(
      new NextRequest("http://localhost:3001/api/projects/4/certificates/999/file"),
      paramsOf({ id: "4", certificateId: "999" }),
    );
    expect(response.status).toBe(404);
  });
});
