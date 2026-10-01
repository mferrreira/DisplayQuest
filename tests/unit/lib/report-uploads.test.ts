import { afterEach, describe, expect, it } from "vitest";
import path from "path";
import fs from "fs";

// A11: relatórios saem de public/ para data/uploads/reports (raiz privada).
// São servidos somente pela rota autenticada app/api/report-files/[...path]/route.ts.
// absolutePathOf precisa continuar bloqueando traversal/prefixos (regressão).

import {
  REPORT_UPLOADS_ROOT,
  absolutePathOf,
  storeReportFile,
  removeStoredReportFile,
  readReportFileBytes,
} from "@/lib/storage/report-uploads";

const PRIVATE_ROOT = path.join(process.cwd(), "data", "uploads", "reports");

describe("absolutePathOf — traversal e prefixos (A11)", () => {
  it("resolva storedPath válido para a raiz privada (sem public/)", () => {
    const abs = absolutePathOf("uploads/reports/7/abc.pdf");
    expect(abs).toBe(path.join(PRIVATE_ROOT, "7", "abc.pdf"));
    expect(abs?.startsWith(PRIVATE_ROOT)).toBe(true);
    expect(abs?.includes(path.join("public"))).toBe(false);
  });

  it("rejeita `..` (traversal)", () => {
    expect(absolutePathOf("uploads/reports/7/../../secret.txt")).toBeNull();
    expect(absolutePathOf("uploads/reports/../7/x.pdf")).toBeNull();
    expect(absolutePathOf("../../etc/passwd")).toBeNull();
  });

  it("rejeita leading slash", () => {
    expect(absolutePathOf("/uploads/reports/7/x.pdf")).toBeNull();
  });

  it("rejeita esquema (http, https, data)", () => {
    expect(absolutePathOf("http://uploads/reports/7/x.pdf")).toBeNull();
    expect(absolutePathOf("https://evil.example/x")).toBeNull();
    expect(absolutePathOf("data:text/html,<h1>x</h1>")).toBeNull();
  });

  it("rejeita prefixo fora da raiz de relatórios", () => {
    expect(absolutePathOf("public/uploads/reports/7/x.pdf")).toBeNull();
    expect(absolutePathOf("uploads/avatars/7/x.webp")).toBeNull();
    expect(absolutePathOf("uploads/report/7/x.pdf")).toBeNull();
    expect(absolutePathOf("uploads/reports")).toBeNull();
  });

  it("rejeita barras invertidas e valores vazios", () => {
    expect(absolutePathOf("uploads\\reports\\7\\x.pdf")).toBeNull();
    expect(absolutePathOf("")).toBeNull();
    expect(absolutePathOf(undefined as never)).toBeNull();
  });
});

describe("storeReportFile — grava na raiz privada (A11)", () => {
  const reportId = 700001;
  let storedPath: string | null = null;

  afterEach(async () => {
    if (storedPath) {
      await removeStoredReportFile(storedPath);
      await fs.promises.rmdir(path.join(PRIVATE_ROOT, String(reportId))).catch(() => {});
      storedPath = null;
    }
  });

  it("storedPath mantém o prefixo público; arquivo fica sob data/uploads/reports", async () => {
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "relatorio.pdf", {
      type: "application/pdf",
    });

    const result = await storeReportFile(reportId, pdf);
    storedPath = result.storedPath;

    expect(result.storedPath).toMatch(
      new RegExp(`^uploads/reports/${reportId}/[0-9a-f-]+\\.pdf$`),
    );

    const dir = path.dirname(result.absolutePath);
    expect(dir).toBe(path.join(REPORT_UPLOADS_ROOT, String(reportId)));
    expect(dir.startsWith(process.cwd())).toBe(true);
    expect(dir.includes(path.join("public"))).toBe(false);

    // idempotência: o resolver reconhece o próprio caminho gravado
    expect(absolutePathOf(result.storedPath)).toBe(result.absolutePath);

    // arquivo de fato no disco
    await expect(fs.promises.access(result.absolutePath)).resolves.toBeUndefined();
  });
});

describe("readReportFileBytes — seam da rota autenticada (A11)", () => {
  it("retorna null para arquivo ausente (sem lançar)", async () => {
    await expect(readReportFileBytes("uploads/reports/700002/x.pdf")).resolves.toBeNull();
  });

  it("retorna null para traversal (sem mexer no disco)", async () => {
    await expect(readReportFileBytes("uploads/reports/7/../../etc/passwd")).resolves.toBeNull();
  });
});