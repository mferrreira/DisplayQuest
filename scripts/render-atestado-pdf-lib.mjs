import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const isTsxChild = process.env.DQ_RENDER_ATTESTADO_TSX_CHILD === "1";
const args = process.argv.slice(2);

if (!isTsxChild) {
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), ...args], {
    stdio: "inherit",
    env: { ...process.env, DQ_RENDER_ATTESTADO_TSX_CHILD: "1" },
  });
  child.on("exit", (code) => process.exit(code ?? 1));
} else {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const rules = await import("../backend/domain/attestation/attestation-rules.ts");
  const adapter = await import("../backend/modules/attestation/infrastructure/adapters/pdf-render-attestation.adapter.ts");

  const build = rules.default.buildAttestationFields;
  const PdfRenderAttestationAdapter = adapter.default.PdfRenderAttestationAdapter;

  const inputPath = args.find((a) => a.startsWith("--input="))?.slice(8);
  const outPath = args.find((a) => a.startsWith("--out="))?.slice(6);
  if (!inputPath || !outPath) {
    console.error("uso: render-atestado-pdf-lib.mjs --input=<input.json> --out=<out.pdf>");
    process.exit(2);
  }

  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const fields = build({ ...input, project: { ...input.project, leaderName: input.orientador } });
  const bytes = await new PdfRenderAttestationAdapter().renderPdf(fields);
  writeFileSync(outPath, bytes);
  console.log(`pdf: ${outPath} (${bytes.length} bytes)`);
}
