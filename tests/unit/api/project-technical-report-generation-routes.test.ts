// @vitest-environment node
/**
 * V5-9b (DEC-129/133/139/167) — rota tests de geração e download do DOCX.
 *
 * Forma medida da casa (B6-2a): módulo REAL sobre portas falsas; só a sessão e o bucket
 * são dobrados. O bucket é dobrado no seam `lib/storage/blob-store` (DEC-133): a rota é
 * quem move byte, e o teste grava os `put` para provar (a) chave derivada, (b) mime do
 * documento, (c) NENHUM put quando o gate recusa — o 403 antes do objeto nascer.
 *
 * O que fica preso: ordem 404 projeto → 403 gate → 400 tipo → 404 texto ausente → 409 sem
 * membros ATIVOS; 503 sem bucket com a MESMA frase do anexo de projeto; download é leitura
 * aberta ao autenticado (outsider VOLUNTARIO baixa 200 — regra 13, DEC-127/136) e chave
 * forjada leva 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createReportingModule } from "@/backend/modules/reporting";
import type { TechnicalReportAccessPort } from "@/backend/modules/reporting/application/ports/technical-report-access.port";
import type { TechnicalReportDocumentPort } from "@/backend/modules/reporting/application/ports/technical-report-document.port";
import type { ReportDraftPort } from "@/backend/modules/reporting/application/ports/report-draft.port";
import type { TechnicalReportSourcesPort } from "@/backend/modules/reporting/application/ports/technical-report-sources.port";
import type {
  TechnicalReportGenerationPort,
  TechnicalReportMemberRow,
  TechnicalReportProjectContext,
} from "@/backend/modules/reporting/application/ports/technical-report-generation.port";
import type {
  TechnicalReportRecord,
  TechnicalReportsRepository,
} from "@/backend/modules/reporting/application/ports/technical-reports.repository";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  rows: new Map<string, TechnicalReportRecord>(),
  membershipRoles: null as string[] | null,
  leaderId: 7,
  projectExists: true,
  members: null as Array<{
    userId: number;
    name: string;
    course: string | null;
    scholarshipType: string | null;
    fundingAgency: string | null;
    fundingAgencyOther: string | null;
  }> | null,
  noBucket: false,
  puts: [] as Array<{ key: string; contentType: string; bytes: number }>,
  blobs: new Map<string, Uint8Array>(),
  draftPrompts: [] as string[],
  aiFails: false,
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

// O seam do bucket é dobrado AQUI porque a rota move byte (DEC-133). O mime real vem do
// importActual: a rota e o seam falam a MESMA grafia, o teste não reescreve o literal.
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
      return { key, body, size: body.byteLength, contentType: DOCX_MIME };
    },
    async head(key: string) {
      const body = mocks.blobs.get(key);
      return body ? { key, size: body.byteLength, contentType: DOCX_MIME } : null;
    },
  };
  return {
    ...actual,
    blobStoreFromEnv: () => (mocks.noBucket ? null : store),
  };
});

vi.mock("@/backend/composition/root", () => {
  const technicalReports: TechnicalReportsRepository = {
    async listByProject(projectId) {
      return [...mocks.rows.values()]
        .filter((row) => row.projectId === projectId)
        .map((row) => ({ ...row }));
    },
    async findByProjectAndType(projectId, type) {
      const row = mocks.rows.get(`${projectId}:${type}`);
      return row ? { ...row } : null;
    },
    async upsert(projectId, type, content) {
      const key = `${projectId}:${type}`;
      const existing = mocks.rows.get(key);
      const record: TechnicalReportRecord = existing
        ? { ...existing, content }
        : {
            id: mocks.rows.size + 1,
            projectId,
            type,
            content,
            createdAt: "2026-10-14T12:00:00.000Z",
            updatedAt: "2026-10-14T12:00:00.000Z",
          };
      mocks.rows.set(key, record);
      return { ...record };
    },
  };

  const access: TechnicalReportAccessPort = {
    async findProjectAccess(projectId, actorId) {
      if (!mocks.projectExists) return null;
      return {
        projectId,
        leaderId: mocks.leaderId,
        membershipRoles: actorId === null ? null : mocks.membershipRoles,
      };
    },
  };

  const CONTEXT: TechnicalReportProjectContext = {
    projectId: 3,
    name: "IA no campo",
    createdAt: "2026-02-01",
    startDate: "2026-03-01",
    endDate: "2026-12-31",
    proppiNumber: null,
    leaderId: 7,
    leaderName: "Profa. Ana Souza",
  };

  const generation: TechnicalReportGenerationPort = {
    async findProjectContext() {
      return mocks.projectExists ? CONTEXT : null;
    },
    async listActiveMembers() {
      return (
        mocks.members ?? [
          { userId: 9, name: "Bento Lima", course: "Sistemas de Informação", scholarshipType: "PIBIC", fundingAgency: "CNPQ", fundingAgencyOther: null },
        ]
      ).map((member: TechnicalReportMemberRow) => ({ ...member }));
    },
  };

  // Render falso: devolve bytes com assinatura ZIP e registra os comandos. O adaptador
  // REAL é exercitado no teste próprio dele (templates) e no roundtrip G4.
  const docx: TechnicalReportDocumentPort & { renders: Record<string, string>[] } = {
    renders: [],
    async render(commands) {
      docx.renders.push({ ...commands });
      return new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    },
  };

  // V5-9c: as três fontes e a IA são portas falsas — o teste de rota não toca rede.
  const sources: TechnicalReportSourcesPort = {
    async listSessionLogs() {
      return [{ date: "2026-05-10", userName: "Bento Lima", activity: "Revisão bibliográfica", duration: 3.5, location: null }];
    },
    async listProjectTasks() {
      return [{ title: "Montar o dataset", status: "done", completedAt: "2026-06-02", points: 15 }];
    },
    async listCronogramaActivities() {
      return [{ description: "Levantamento bibliográfico", firstMonth: "2026-03", lastMonth: "2026-05", status: "DONE", evidenceCount: 2 }];
    },
  };

  const draftPort: ReportDraftPort = {
    async generateDraft(prompt) {
      mocks.draftPrompts.push(prompt);
      if (mocks.aiFails) {
        throw new Error("IA indisponível: HTTP 503");
      }
      return "Descrição das Atividades\nRascunho da IA.";
    },
  };

  const reporting = createReportingModule({
    ports: {
      technicalReports,
      technicalReportAccess: access,
      technicalReportGeneration: generation,
      technicalReportDocument: docx,
      technicalReportSources: sources,
      reportDraft: draftPort,
    },
  });
  return {
    getBackendComposition: () => ({
      identityAccess: {
        hasPermission: () => false,
        hasAnyRole: () => false,
      },
      reporting,
    }),
  };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { POST } from "@/app/api/projects/[id]/technical-reports/[segment]/generate/route";
import { GET } from "@/app/api/projects/[id]/technical-reports/[segment]/file/route";
import { POST as POST_DRAFT } from "@/app/api/projects/[id]/technical-reports/[segment]/draft/route";

function login(roles: string[], id = 8) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function seedReport(content = "Descrição das Atividades\nEtapa 1.") {
  mocks.rows.set("3:parcial", {
    id: 1,
    projectId: 3,
    type: "parcial",
    content,
    createdAt: "2026-10-14T12:00:00.000Z",
    updatedAt: "2026-10-14T12:00:00.000Z",
  });
}

function generateRequest(type = "parcial") {
  return new NextRequest(`http://localhost:3000/api/projects/3/technical-reports/${type}/generate`, {
    method: "POST",
  });
}

function generateContext(type = "parcial") {
  return { params: Promise.resolve({ id: "3", segment: type }) };
}

function fileRequest(userId: string | null) {
  const query = userId === null ? "" : `?userId=${userId}`;
  return new NextRequest(`http://localhost:3000/api/projects/3/technical-reports/1/file${query}`);
}

beforeEach(() => {
  mocks.rows.clear();
  mocks.puts.length = 0;
  mocks.blobs.clear();
  mocks.members = null;
  mocks.noBucket = false;
  mocks.projectExists = true;
  mocks.leaderId = 7;
  mocks.membershipRoles = null;
  mocks.draftPrompts.length = 0;
  mocks.aiFails = false;
  login(["PESQUISADOR"], 7); // default: o líder do projeto
  seedReport();
});

describe("POST /api/projects/[id]/technical-reports/[type]/generate (V5-9b)", () => {
  it("líder gera lote: 201 com um arquivo por membro, bucket recebe put na chave derivada", async () => {
    const response = await POST(generateRequest(), generateContext());
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.files).toEqual([
      {
        userId: 9,
        memberName: "Bento Lima",
        key: "projects/3/technical-reports/1/9.docx",
        fileName: "relatorio-parcial-bento-lima.docx",
      },
    ]);
    // bytes NÃO saem na resposta — saem no bucket.
    expect(body.files[0]).not.toHaveProperty("bytes");

    expect(mocks.puts).toEqual([
      { key: "projects/3/technical-reports/1/9.docx", contentType: DOCX_MIME, bytes: 4 },
    ]);
  });

  it("outsider leva 403 com a MESMA frase e NENHUM objeto nasce no bucket (DEC-133)", async () => {
    login(["PESQUISADOR"], 8);
    mocks.membershipRoles = ["VOLUNTARIO"];

    const response = await POST(generateRequest(), generateContext());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe(
      "Usuário não tem permissão para editar o relatório técnico deste projeto",
    );
    expect(mocks.puts).toHaveLength(0);
  });

  it("ordem medida: outsider com tipo inválido leva 403, não 400 (B6-2b)", async () => {
    login(["PESQUISADOR"], 8);
    mocks.membershipRoles = ["VOLUNTARIO"];

    const response = await POST(generateRequest("mensal"), generateContext("mensal"));
    expect(response.status).toBe(403);
  });

  it("projeto ausente é 404 antes do gate", async () => {
    mocks.projectExists = false;
    const response = await POST(generateRequest(), generateContext());
    expect(response.status).toBe(404);
  });

  it("tipo fora da lista é 400 com a MESMA frase do upsert", async () => {
    const response = await POST(generateRequest("mensal"), generateContext("mensal"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      'Tipo de relatório técnico inválido: use "parcial", "tecnico-final" ou "final"',
    );
  });

  it("sem texto salvo é 404 nomeando a exigência", async () => {
    mocks.rows.clear();
    const response = await POST(generateRequest(), generateContext());
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe(
      "Salve o texto do relatório antes de gerar o documento",
    );
  });

  it("sem membro ATIVO é 409 — lote de zero arquivos não é sucesso", async () => {
    mocks.members = [];
    const response = await POST(generateRequest(), generateContext());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "O projeto não tem membros ativos — o relatório é gerado um documento por membro",
    );
  });

  it("sem bucket no ambiente é 503 com a MESMA frase do anexo de projeto", async () => {
    mocks.noBucket = true;
    const response = await POST(generateRequest(), generateContext());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET",
    });
  });

  it("desautenticado é 401", async () => {
    mocks.session = null;
    const response = await POST(generateRequest(), generateContext());
    expect(response.status).toBe(401);
  });
});

describe("GET /api/projects/[id]/technical-reports/[reportId]/file (V5-9b)", () => {
  it("leitura aberta: outsider VOLUNTARIO baixa o DOCX com mime e attachment (regra 13)", async () => {
    login(["VOLUNTARIO"], 8); // não é líder nem gestão
    mocks.blobs.set("projects/3/technical-reports/1/9.docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04]));

    const response = await GET(fileRequest("9"), { params: Promise.resolve({ id: "3", segment: "1" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(DOCX_MIME);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="relatorio-tecnico-1-9.docx"');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("chave forjada (reportId/userId que ninguém gerou) é 404", async () => {
    const response = await GET(fileRequest("999"), { params: Promise.resolve({ id: "3", segment: "77" }) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Arquivo ainda não gerado — gere o documento a partir do texto salvo",
    });
  });

  it("userId ausente ou não numérico é 400", async () => {
    const missing = await GET(fileRequest(null), { params: Promise.resolve({ id: "3", segment: "1" }) });
    expect(missing.status).toBe(400);
    const bogus = await GET(fileRequest("abc"), { params: Promise.resolve({ id: "3", segment: "1" }) });
    expect(bogus.status).toBe(400);
  });

  it("sem bucket é 503 com a MESMA frase do anexo", async () => {
    mocks.noBucket = true;
    const response = await GET(fileRequest("9"), { params: Promise.resolve({ id: "3", segment: "1" }) });
    expect(response.status).toBe(503);
  });

  it("desautenticado é 401", async () => {
    mocks.session = null;
    const response = await GET(fileRequest("9"), { params: Promise.resolve({ id: "3", segment: "1" }) });
    expect(response.status).toBe(401);
  });
});

describe("POST /api/projects/[id]/technical-reports/[segment]/draft (V5-9c)", () => {
  function draftRequest(type = "parcial") {
    return new NextRequest(`http://localhost:3000/api/projects/3/technical-reports/${type}/draft`, {
      method: "POST",
    });
  }

  function draftContext(type = "parcial") {
    return { params: Promise.resolve({ id: "3", segment: type }) };
  }

  it("líder rascunha: 200 com o texto da IA e o prompt chegou montado com as fontes", async () => {
    const response = await POST_DRAFT(draftRequest(), draftContext());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ draft: "Descrição das Atividades\nRascunho da IA." });

    expect(mocks.draftPrompts).toHaveLength(1);
    expect(mocks.draftPrompts[0]).toContain("Revisão bibliográfica");
    expect(mocks.draftPrompts[0]).toContain("Montar o dataset");
    expect(mocks.draftPrompts[0]).toContain("Levantamento bibliográfico");
  });

  it("outsider leva 403 com a MESMA frase e a IA não é chamada", async () => {
    login(["PESQUISADOR"], 8);
    mocks.membershipRoles = ["VOLUNTARIO"];

    const response = await POST_DRAFT(draftRequest(), draftContext());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe(
      "Usuário não tem permissão para editar o relatório técnico deste projeto",
    );
    expect(mocks.draftPrompts).toHaveLength(0);
  });

  it("projeto ausente é 404; tipo inválido é 400 com a frase única", async () => {
    mocks.projectExists = false;
    expect((await POST_DRAFT(draftRequest(), draftContext())).status).toBe(404);

    mocks.projectExists = true;
    const bad = await POST_DRAFT(draftRequest("mensal"), draftContext("mensal"));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe(
      'Tipo de relatório técnico inválido: use "parcial", "tecnico-final" ou "final"',
    );
  });

  it("falha da IA é 502 com a frase do adaptador — não 500 legado", async () => {
    mocks.aiFails = true;
    const response = await POST_DRAFT(draftRequest(), draftContext());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("IA indisponível: HTTP 503");
  });

  it("desautenticado é 401", async () => {
    mocks.session = null;
    expect((await POST_DRAFT(draftRequest(), draftContext())).status).toBe(401);
  });
});
