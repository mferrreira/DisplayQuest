#!/usr/bin/env node
// Smoke do plano (V7-4.5): sobe o MCP contra o app real e percorre as 15 leituras e as
// escritas de controle no projeto de areia [MCP-VALIDACAO]. Não roda no CI sem app.
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { Client } from "@modelcontextprotocol/client"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client"

const mcpDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const port = Number(process.env.MCP_PORT ?? 8787)
const appBase = process.env.DQ_API_BASE ?? "http://127.0.0.1:3000"
const agentEmail = process.env.DQ_AGENT_EMAIL ?? "mcp-agent@displayquest.local"
const SANDPIT_PREFIX = "[MCP-VALIDACAO]"

if (!process.env.DQ_AGENT_PASSWORD && !process.env.MCP_AGENT_PASSWORD) {
  console.error("DQ_AGENT_PASSWORD ausente — o smoke precisa da senha da conta de serviço no ambiente.")
  process.exit(1)
}

const child = spawn(
  process.execPath,
  [join(mcpDir, "node_modules", "tsx", "dist", "cli.mjs"), "src/index.ts"],
  {
    cwd: mcpDir,
    env: { ...process.env, MCP_PORT: String(port), MCP_BIND_IP: "127.0.0.1", DQ_API_BASE: appBase },
    stdio: ["ignore", "inherit", "inherit"],
  },
)

let exited = false
child.on("exit", (code) => {
  exited = true
  if (code !== 0 && code !== null) console.error(`servidor MCP morreu com código ${code}`)
})

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (exited) throw new Error("o servidor MCP morreu antes de ficar saudável")
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`)
      if (response.ok) return await response.json()
    } catch {
      // ainda subindo
    }
    await sleep(500)
  }
  throw new Error("healthz não respondeu a tempo")
}

function unwrap(result, label) {
  if (result.isError) {
    const detail = result.structuredContent?.message ?? JSON.stringify(result.content)
    throw new Error(`${label} falhou: ${detail}`)
  }
  return result.structuredContent ?? {}
}

async function call(client, name, args, label = name) {
  return unwrap(await client.callTool({ name, arguments: args }), label)
}

// 503/502 são propagação esperada: registram o code em vez de derrubar o smoke.
async function callTolerant(client, name, args, okCodes) {
  const result = await client.callTool({ name, arguments: args })
  if (result.isError) {
    const code = result.structuredContent?.code
    if (okCodes.includes(code)) {
      console.log(`ok: ${name} propagou ${code} (${result.structuredContent.status})`)
      return null
    }
    throw new Error(`${name} falhou: ${result.structuredContent?.message}`)
  }
  console.log(`ok: ${name}`)
  return result.structuredContent ?? {}
}

const READS = [
  ["people_list", {}],
  ["people_statistics", { type: "status" }],
  ["leaderboard_get", { type: "points", limit: 5 }],
  ["task_list", {}],
  ["global_progress_get", {}],
  ["work_sessions_list", { active: true }],
  ["weekly_hours_history_get", { stats: true }],
  ["laboratory_schedule_get", {}],
  ["weekly_report_list", {}],
]

async function main() {
  const health = await waitForHealth()
  console.log(`healthz: ${JSON.stringify(health)}`)

  const client = new Client({ name: "dq-smoke", version: "0.1.0" })
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)))

  try {
    const listed = await client.listTools()
    if (listed.tools.length !== 25) throw new Error(`tools/list devolveu ${listed.tools.length}, esperado 25`)
    console.log(`ok: tools/list com ${listed.tools.length} tools`)

    for (const [name, args] of READS) {
      const data = await call(client, name, args)
      const size = Object.values(data).find((value) => Array.isArray(value))?.length
      console.log(`ok: ${name}${size !== undefined ? ` (${size} itens)` : ""}`)
    }

    // areia: reaproveita o projeto [MCP-VALIDACAO] mais recente, senão cria um.
    const { projects } = await call(client, "project_list", {})
    const people = (await call(client, "people_list", {})).users ?? []
    const agent = people.find((user) => user.email === agentEmail)
    const agentId = agent?.id ?? 1099

    const existing = projects.find((project) => String(project.name).startsWith(SANDPIT_PREFIX))
    let projectId = existing?.id
    if (projectId) {
      console.log(`ok: areia reaproveitada: ${projectId} (${existing.name})`)
    } else {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ")
      const created = await call(client, "project_create", {
        name: `${SANDPIT_PREFIX} ${stamp}`,
        description: "Projeto de areia do plan-v7 (smoke).",
        status: "active",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      })
      projectId = created.project?.id ?? created.id
      if (!projectId) throw new Error("project_create não devolveu id")
      console.log(`ok: project_create → ${projectId} (${created.project?.name})`)
    }

    // leituras escopadas na areia
    await call(client, "project_get", { projectId })
    await call(client, "task_list", { projectId })
    await call(client, "hours_get", { projectId })
    await call(client, "technical_report_list", { projectId })
    await call(client, "member_performance", { userId: agentId, projectId })
    console.log(`ok: leituras escopadas na areia (project_get, task_list, hours_get, technical_report_list, member_performance)`)

    // escritas de controle
    const updated = await call(client, "project_update", { projectId, description: "Areia configurada pelo smoke." })
    if (!updated.project) throw new Error("project_update não devolveu projeto")
    console.log("ok: project_update")

    await call(client, "deliverable_create", { projectId, name: "Entregável do smoke", quantity: 1 })
    console.log("ok: deliverable_create")

    const activity = await call(client, "activity_create", {
      projectId,
      description: "Atividade do smoke",
      firstMonth: "2026-01",
      lastMonth: "2026-03",
    })
    const activityId = activity.activity?.id
    if (!activityId) throw new Error("activity_create não devolveu id")
    console.log(`ok: activity_create → ${activityId}`)
    await call(client, "activity_update", { projectId, activityId, description: "Atividade do smoke (atualizada)" })
    console.log("ok: activity_update")

    // relatório semanal de uma pessoa, período curto e passado
    await call(client, "weekly_report_generate", { userId: agentId, weekStart: "2026-10-12", weekEnd: "2026-10-18" })
    console.log("ok: weekly_report_generate")
    // weekly_report_bulk_generate fica fora do smoke por decisão do plano (escreve em todos)

    await call(client, "technical_report_save", {
      projectId,
      type: "parcial",
      content: "Relatório parcial de areia criado pelo smoke do plan-v7.",
    })
    console.log("ok: technical_report_save")

    const generated = await callTolerant(client, "technical_report_generate", { projectId, type: "parcial" }, [
      "bucket_unavailable",
    ])
    if (generated) console.log(`     DOCX gerados: ${generated.count ?? 0}`)

    const draft = await callTolerant(client, "technical_report_draft", { projectId, type: "parcial" }, [
      "ai_unavailable",
    ])
    if (draft?.draft) console.log(`     rascunho: ${String(draft.draft).slice(0, 60)}…`)

    const overview = await call(client, "project_overview", { projectId })
    console.log(`     seções: ${Object.keys(overview).join(", ")}`)
    if ((overview.warnings ?? []).length > 0) {
      console.log(`     warnings: ${JSON.stringify(overview.warnings)}`)
    }

    // recurso DOCX
    const reports = (await call(client, "technical_report_list", { projectId })).reports ?? []
    const reportId = reports[0]?.id
    if (generated && reportId) {
      const resource = await client.readResource({
        uri: `dq://projects/${projectId}/technical-reports/${reportId}/file?userId=${agentId}`,
      })
      const blob = resource.contents[0]?.blob
      console.log(`ok: resources/read DOCX (${blob ? Buffer.from(blob, "base64").length : 0} bytes)`)
    }

    console.log(`\nsmoke verde — areia: ${projectId}`)
  } finally {
    await client.close().catch(() => {})
    child.kill("SIGTERM")
  }
}

main().catch((error) => {
  console.error(`smoke vermelho: ${error.message}`)
  child.kill("SIGTERM")
  process.exit(1)
})
