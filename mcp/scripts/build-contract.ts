import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { z } from "zod"

import { ALL_TOOL_DEFINITIONS } from "../src/tools/index.js"
import {
  DOCX_MIME_TYPE,
  TECHNICAL_REPORT_FILE_URI_TEMPLATE,
} from "../src/resources/technical-report-file.js"

const here = dirname(fileURLToPath(import.meta.url))
const contractPath = join(here, "..", "tools.json")

const contract = {
  name: "displayquest-mcp",
  version: "0.1.0",
  protocolVersion: "2026-07-28",
  endpoint: "http://<host>:8787/mcp",
  transport: "streamable-http",
  clientAuth: { mode: "none", scope: "LAN only" },
  tools: ALL_TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.inputSchema),
    annotations: { readOnlyHint: tool.readOnly, destructiveHint: false },
    returns: tool.returns,
    errors: [...tool.errors],
  })),
  resources: [
    {
      uriTemplate: TECHNICAL_REPORT_FILE_URI_TEMPLATE,
      mimeType: DOCX_MIME_TYPE,
    },
  ],
}

const serialized = `${JSON.stringify(contract, null, 2)}\n`

if (process.argv.includes("--check")) {
  let committed: string
  try {
    committed = readFileSync(contractPath, "utf8")
  } catch {
    console.error(`tools.json não existe em ${contractPath} — rode: npm run tools:json`)
    process.exit(1)
  }
  if (committed !== serialized) {
    const committedHash = createHash("sha256").update(committed).digest("hex").slice(0, 12)
    const generatedHash = createHash("sha256").update(serialized).digest("hex").slice(0, 12)
    console.error(`tools.json diverge do schema do servidor (${committedHash} ≠ ${generatedHash}) — rode: npm run tools:json`)
    process.exit(1)
  }
  console.log(`tools.json confere com o schema (${contract.tools.length} tools, ${contract.resources.length} recursos)`)
  process.exit(0)
}

mkdirSync(dirname(contractPath), { recursive: true })
writeFileSync(contractPath, serialized)
console.log(`tools.json gerado: ${contract.tools.length} tools, ${contract.resources.length} recursos`)
