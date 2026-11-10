import { writeFileSync } from "node:fs";

import { readFileSync } from "node:fs";
import rules from "../backend/domain/attestation/attestation-rules.ts";
import adapters from "../backend/modules/attestation/infrastructure/adapters/html-attestation.adapter.ts";

const args = process.argv.slice(2);
const inputPath = args.find((a) => a.startsWith("--input="))?.slice(8);
const outPath = args.find((a) => a.startsWith("--out="))?.slice(6);
if (!inputPath || !outPath) {
  console.error("uso: render-atestado-html.mjs --input=<input.json> --out=<out.pdf>");
  process.exit(2);
}

const input = JSON.parse(readFileSync(inputPath, "utf8"));
const fields = rules.buildAttestationFields({ ...input, project: { ...input.project, leaderName: input.orientador } });
const bytes = await new adapters.HtmlAttestationAdapter().renderPdf(fields);
writeFileSync(outPath, bytes);
console.log(`pdf: ${outPath} (${bytes.length} bytes)`);
