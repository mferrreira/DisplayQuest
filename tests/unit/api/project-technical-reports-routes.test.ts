// @vitest-environment node
/**
 * V5-9 (DEC-70/139/167) — rota tests de `app/api/projects/[id]/technical-reports`.
 *
 * Forma medida da casa (B6-2a/B6-2b): o módulo é REAL sobre portas falsas
 * (`createReportingModule({ ports: { technicalReports, technicalReportAccess } })`) e só a
 * sessão é dobrada — `requireApiActor` e o mapeamento de DomainError seguem os de produção.
 * Um `vi.mock` do composition root devolvendo um objeto fake faria o 403 SUMIR do teste: a
 * rota não decide mais, e o duplo também não.
 *
 * O que fica preso: leitura aberta ao autenticado (outsider VOLUNTARIO lista 200); escrita
 * "gestão/líder" com a ordem 404 projeto → 403 gate → 400 corpo; o quirk da ACL
 * (membership [VOLUNTARIO] com COORDENADOR global → 403).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createReportingModule } from "@/backend/modules/reporting";
import type { TechnicalReportAccessPort } from "@/backend/modules/reporting/application/ports/technical-report-access.port";
import type {
  TechnicalReportRecord,
  TechnicalReportsRepository,
} from "@/backend/modules/reporting/application/ports/technical-reports.repository";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  rows: new Map<string, TechnicalReportRecord>(),
  // null = sem vínculo; outOfRange = projeto ausente.
  membershipRoles: null as string[] | null,
  leaderId: 7,
  projectExists: true,
}));

// Os adapters default do módulo importam `@/lib/database/prisma`; nenhum método deles é
// exercitado aqui. O duplo lança ALTO para que uma porta esquecida não passe silenciosa
// (lição DEC-54).
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

  const reporting = createReportingModule({
    ports: { technicalReports, technicalReportAccess: access },
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

import { GET, PUT } from "@/app/api/projects/[id]/technical-reports/route";

function login(roles: string[], id = 8) {
  // Sempre array: `requireApiActor` normaliza com `normalizeRoles`, e string solta vira `[]`
  // e negaria todo mundo (gotcha medido no B6).
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function putRequest(body: unknown) {
  return new NextRequest(new URL("http://localhost:3000/api/projects/3/technical-reports"), {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function put(body: unknown) {
  return PUT(putRequest(body), context("3"));
}

beforeEach(() => {
  mocks.session = null;
  mocks.rows.clear();
  mocks.membershipRoles = null;
  mocks.leaderId = 7;
  mocks.projectExists = true;
});

describe("GET /api/projects/[id]/technical-reports", () => {
  it("401 sem sessão", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/projects/3/technical-reports"),
      context("3"),
    );
    expect(response.status).toBe(401);
  });

  it("leitura aberta: VOLUNTARIO outsider lista 200 (regra 13 do plano)", async () => {
    login(["VOLUNTARIO"], 99);
    mocks.rows.set("3:parcial", {
      id: 1,
      projectId: 3,
      type: "parcial",
      content: "Texto",
      createdAt: "2026-10-14T12:00:00.000Z",
      updatedAt: "2026-10-14T12:00:00.000Z",
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/projects/3/technical-reports"),
      context("3"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0].content).toBe("Texto");
  });

  it("projeto ausente é 404", async () => {
    login(["VOLUNTARIO"]);
    mocks.projectExists = false;
    const response = await GET(
      new NextRequest("http://localhost:3000/api/projects/999/technical-reports"),
      context("999"),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Projeto não encontrado");
  });

  it("id inválido é 400 de rota", async () => {
    login(["VOLUNTARIO"]);
    const response = await GET(
      new NextRequest("http://localhost:3000/api/projects/abc/technical-reports"),
      context("abc"),
    );
    expect(response.status).toBe(400);
  });
});

describe("PUT /api/projects/[id]/technical-reports", () => {
  it("líder salva e a rota repassa o ator normalizado", async () => {
    login(["PESQUISADOR"], 7); // ator 7 = leaderId
    const response = await put({ type: "parcial", content: "Relatório do líder" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.report.content).toBe("Relatório do líder");
    expect(body.report.type).toBe("parcial");
  });

  it("COORDENADOR global sem membership salva (fallback da ACL)", async () => {
    login(["COORDENADOR"], 8);
    const response = await put({ type: "final", content: "Versão final" });
    expect(response.status).toBe(200);
  });

  it("quirk da ACL: membership [VOLUNTARIO] com COORDENADOR global leva 403", async () => {
    login(["COORDENADOR"], 8);
    mocks.membershipRoles = ["VOLUNTARIO"];
    const response = await put({ type: "parcial", content: "X" });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe(
      "Usuário não tem permissão para editar o relatório técnico deste projeto",
    );
  });

  it("403 vem ANTES do 400 de corpo (ordem medida, B6-2b)", async () => {
    login(["PESQUISADOR"], 8);
    mocks.membershipRoles = ["VOLUNTARIO"];
    const response = await put({ type: "mensal", content: 42 });
    expect(response.status).toBe(403);
  });

  it("tipo fora da lista é 400 nomeando os permitidos", async () => {
    login(["COORDENADOR"], 8);
    const response = await put({ type: "mensal", content: "X" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      'Tipo de relatório técnico inválido: use "parcial", "tecnico-final" ou "final"',
    );
  });

  it("projeto ausente é 404 antes do gate", async () => {
    login(["PESQUISADOR"], 8);
    mocks.projectExists = false;
    const response = await put({ type: "parcial", content: "X" });
    expect(response.status).toBe(404);
  });
});
