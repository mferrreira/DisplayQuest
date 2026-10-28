import http from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"

import { createMcpHttpServer } from "../src/index.js"
import { DisplayQuestError } from "../src/errors.js"
import type { McpConfig } from "../src/config.js"
import type { BinaryResponse, DisplayQuestClient, RequestOptions } from "../src/displayquest-client.js"

/**
 * V7-4.2: cada tool aceita o exemplo mínimo que o README mostra — enviado pelo cliente
 * MCP, não por chamada direta ao handler.
 */
const README_EXAMPLES: Record<string, Record<string, unknown>> = {
  people_list: {},
  people_statistics: { type: "status" },
  leaderboard_get: { month: "2026-09" },
  project_list: {},
  project_get: { projectId: 7 },
  project_overview: { projectId: 7 },
  member_performance: { userId: 1, projectId: 7 },
  task_list: { projectId: 7 },
  global_progress_get: {},
  hours_get: { projectId: 7 },
  work_sessions_list: { active: true },
  weekly_hours_history_get: { stats: true },
  laboratory_schedule_get: {},
  weekly_report_list: { userId: 1 },
  technical_report_list: { projectId: 7 },
  project_create: { name: "[MCP-VALIDACAO] exemplo do README" },
  project_update: { projectId: 7, description: "Descrição do exemplo." },
  deliverable_create: { projectId: 7, name: "Entregável do exemplo", quantity: 2 },
  activity_create: { projectId: 7, description: "Atividade do exemplo", firstMonth: "2026-01", lastMonth: "2026-03" },
  activity_update: { projectId: 7, activityId: 12, description: "Atividade ajustada" },
  weekly_report_generate: { userId: 1, weekStart: "2026-10-12", weekEnd: "2026-10-18" },
  weekly_report_bulk_generate: { periodType: "weekly", from: "2026-10-12", to: "2026-10-18" },
  technical_report_save: { projectId: 7, type: "parcial", content: "Texto do exemplo." },
  technical_report_generate: { projectId: 7, type: "parcial" },
  technical_report_draft: { projectId: 7, type: "parcial" },
}

const contractTools = (
  JSON.parse(readFileSync(join(import.meta.dirname, "..", "tools.json"), "utf8")) as {
    tools: Array<{ name: string }>
  }
).tools.map((tool) => tool.name)

const config: McpConfig = {
  appBaseUrl: "http://app.test",
  agentEmail: "mcp-agent@displayquest.local",
  agentPassword: "senha-de-teste",
  port: 0,
  bindIp: "127.0.0.1",
  requestTimeoutMs: 15_000,
  binaryRequestTimeoutMs: 30_000,
  allowedOriginHostnames: ["localhost", "127.0.0.1"],
}

async function connectWith(
  request: (options: RequestOptions) => Promise<unknown>,
): Promise<{ client: Client; close: () => Promise<void> }> {
  const stub = {
    request,
    requestBinary: async (): Promise<BinaryResponse> => ({
      bytes: new Uint8Array([1]),
      contentType: "application/octet-stream",
      fileName: null,
    }),
  } as unknown as DisplayQuestClient

  const server = createMcpHttpServer(config, stub)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address() as AddressInfo
  const client = new Client({ name: "exemplos-readme", version: "0.0.1" })
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)))
  return {
    client,
    close: async () => {
      await client.close().catch(() => {})
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

const accepting = { client: null as Client | null, close: async () => {} }
const rejecting = { client: null as Client | null, close: async () => {} }

async function call(
  handle: { client: Client | null },
  name: string,
  args: Record<string, unknown>,
) {
  if (!handle.client) throw new Error(`servidor de teste ${name} ainda não conectou`)
  return handle.client.callTool({ name, arguments: args })
}

function firstText(result: Awaited<ReturnType<typeof call>>): string {
  const block = result.content?.[0]
  return block && block.type === "text" ? block.text : ""
}

beforeAll(async () => {
  const a = await connectWith(async () => ({}))
  const r = await connectWith(async () => {
    throw new DisplayQuestError({ status: 400, code: "invalid_input", message: "Formato de mês inválido" })
  })
  accepting.client = a.client
  accepting.close = a.close
  rejecting.client = r.client
  rejecting.close = r.close
})

afterAll(async () => {
  await accepting.close()
  await rejecting.close()
})

describe("exemplos mínimos do README", () => {
  it("o README cobre exatamente as 25 tools do contrato", () => {
    expect(Object.keys(README_EXAMPLES).sort()).toEqual([...contractTools].sort())
  })

  for (const [name, args] of Object.entries(README_EXAMPLES)) {
    it(`${name} aceita o exemplo do README pelo tools/call`, async () => {
      const result = await call(accepting, name, args)
      expect(result.isError, `${name}: ${JSON.stringify(result.structuredContent ?? result.content)}`).toBeFalsy()
    })
  }
})

describe("o que o schema anunciado recusa", () => {
  const SCHEMA_VIOLATIONS = [
    ["project_get", { projectId: "sete" }],
    ["deliverable_create", { projectId: 7, name: "x", quantity: 0 }],
    ["technical_report_save", { projectId: 7, type: "rascunho", content: "x" }],
    ["activity_update", { projectId: 7 }],
    ["weekly_report_bulk_generate", { periodType: "quinzenal", from: "2026-10-12", to: "2026-10-18" }],
    ["leaderboard_get", { month: "setembro/2026" }],
  ] as const

  for (const [name, args] of SCHEMA_VIOLATIONS) {
    it(`${name} recusa argumento fora do schema anunciado`, async () => {
      const result = await call(accepting, name, args as Record<string, unknown>)
      expect(result.isError, `${name} aceitou ${JSON.stringify(args)}`).toBe(true)
      const text = firstText(result)
      expect(text).toContain("Invalid arguments")
    })
  }

  it("a recusa do SDK não carrega structuredContent — o contrato vale para o que chega à tool", async () => {
    const result = await call(accepting, "project_get", { projectId: "sete" })
    expect(result.structuredContent).toBeUndefined()
  })
})

describe("validação que o MCP delega ao app", () => {
  it("firstMonth fora de YYYY-MM passa pelo MCP e a recusa vem do app como invalid_input", async () => {
    const result = await call(rejecting, "activity_create", { projectId: 7, description: "x", firstMonth: "01/2026", lastMonth: "2026-03" })
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({ status: 400, code: "invalid_input" })
  })

  it("datas de relatório fora do formato também passam pelo MCP e são recusadas pela rota", async () => {
    const result = await call(rejecting, "weekly_report_generate", { userId: 1, weekStart: "12/10/2026", weekEnd: "2026-10-18" })
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({ status: 400, code: "invalid_input" })
  })
})
