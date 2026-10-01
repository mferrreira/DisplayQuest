import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError, NotFoundError } from "@/backend/domain/errors";

// A11: relatórios só baixam pela rota autenticada /api/report-files/[...path],
// com a MESMA regra de acesso da rota app/api/project-reports/[id]/route.ts
// (getProjectReport), e com bytes + Content-Type por extensão.

const authMock = vi.hoisted(() => ({ requireApiActor: vi.fn() }));

const compositionMock = vi.hoisted(() => {
  const reporting = { getProjectReport: vi.fn() };
  return { getBackendComposition: () => ({ reporting }) };
});

const storageMock = vi.hoisted(() => ({
  absolutePathOf: vi.fn(),
  readReportFileBytes: vi.fn(),
}));

vi.mock("@/lib/auth/api-guard", () => ({ requireApiActor: authMock.requireApiActor }));
vi.mock("@/backend/composition/root", () => compositionMock);
vi.mock("@/lib/storage/report-uploads", () => storageMock);

import { GET } from "../../../app/api/report-files/[...path]/route";

const actor = { id: 10, roles: ["GERENTE"] };

function getProjectReportMock() {
  return compositionMock.getBackendComposition().reporting.getProjectReport;
}

function callGet(path: string[]) {
  return GET(new Request(`http://localhost/api/report-files/${path.join("/")}`), {
    params: Promise.resolve({ path }),
  });
}

beforeEach(() => {
  authMock.requireApiActor.mockReset();
  authMock.requireApiActor.mockResolvedValue({ actor, error: null });
  storageMock.absolutePathOf.mockReset();
  storageMock.readReportFileBytes.mockReset();
  getProjectReportMock().mockReset();
});

describe("GET /api/report-files/[...path] — downloads autenticados (A11)", () => {
  it("200 com bytes e Content-Type por extensão quando o acesso vale", async () => {
    storageMock.absolutePathOf.mockReturnValue("/app/data/uploads/reports/7/abc.pdf");
    storageMock.readReportFileBytes.mockResolvedValue(Buffer.from("conteudo-do-pdf"));
    getProjectReportMock().mockResolvedValue({ id: 7 });

    const res = await callGet(["uploads", "reports", "7", "abc.pdf"]);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(await res.text()).toBe("conteudo-do-pdf");
  });

  it("403 quando a regra de acesso do relatório nega", async () => {
    storageMock.absolutePathOf.mockReturnValue("/app/data/uploads/reports/7/abc.pdf");
    getProjectReportMock().mockRejectedValue(new ForbiddenError("Acesso negado"));

    const res = await callGet(["uploads", "reports", "7", "abc.pdf"]);

    expect(res.status).toBe(403);
    expect(storageMock.readReportFileBytes).not.toHaveBeenCalled();
  });

  it("404 quando o relatório não existe", async () => {
    storageMock.absolutePathOf.mockReturnValue("/app/data/uploads/reports/9/abc.pdf");
    getProjectReportMock().mockRejectedValue(new NotFoundError("Relatório não encontrado"));

    const res = await callGet(["uploads", "reports", "9", "abc.pdf"]);

    expect(res.status).toBe(404);
  });

  it("404 para traversal (..) sem sequer consultar acesso", async () => {
    storageMock.absolutePathOf.mockReturnValue(null); // resolver bloqueou antes

    const res = await callGet(["uploads", "reports", "7", "../../x.pdf"]);

    expect(res.status).toBe(404);
    expect(getProjectReportMock()).not.toHaveBeenCalled();
    expect(storageMock.readReportFileBytes).not.toHaveBeenCalled();
  });

  it("404 quando o arquivo não existe (leitura nula)", async () => {
    storageMock.absolutePathOf.mockReturnValue("/app/data/uploads/reports/7/missing.pdf");
    storageMock.readReportFileBytes.mockResolvedValue(null);
    getProjectReportMock().mockResolvedValue({ id: 7 });

    const res = await callGet(["uploads", "reports", "7", "missing.pdf"]);

    expect(res.status).toBe(404);
  });
});