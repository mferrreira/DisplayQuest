import { describe, expect, it, vi } from "vitest"

import { DisplayQuestError, statusToCode } from "../src/errors.js"
import {
  ALL_TOOL_DEFINITIONS,
  READ_TOOL_COUNT,
  TOTAL_TOOL_COUNT,
  WRITE_TOOL_COUNT,
} from "../src/tools/index.js"
import { runTool } from "../src/tools/result.js"
import type { ToolDefinition } from "../src/tools/types.js"
import type { DisplayQuestClient, RequestOptions } from "../src/displayquest-client.js"

const MINIMAL_ARGS: Record<string, Record<string, unknown>> = {
  people_list: {},
  people_statistics: {},
  leaderboard_get: {},
  project_list: {},
  project_get: { projectId: 1 },
  project_overview: { projectId: 1 },
  member_performance: { userId: 1 },
  task_list: {},
  global_progress_get: {},
  hours_get: { projectId: 1 },
  work_sessions_list: {},
  weekly_hours_history_get: {},
  laboratory_schedule_get: {},
  weekly_report_list: {},
  technical_report_list: { projectId: 1 },
  project_create: { name: "Projeto de teste" },
  project_update: { projectId: 1 },
  deliverable_create: { projectId: 1, name: "Entregável", quantity: 1 },
  activity_create: { projectId: 1, description: "Atividade", firstMonth: "2026-01", lastMonth: "2026-02" },
  activity_update: { projectId: 1, activityId: 2 },
  weekly_report_generate: { userId: 1, weekStart: "2026-01-05", weekEnd: "2026-01-11" },
  weekly_report_bulk_generate: { periodType: "weekly", from: "2026-01-05", to: "2026-01-11" },
  technical_report_save: { projectId: 1, type: "parcial", content: "texto" },
  technical_report_generate: { projectId: 1, type: "parcial" },
  technical_report_draft: { projectId: 1, type: "parcial" },
}

function clientReturning(handler: (options: RequestOptions) => unknown): DisplayQuestClient {
  return { request: vi.fn(async (options: RequestOptions) => handler(options)) } as unknown as DisplayQuestClient
}

function clientThrowing(status: number): DisplayQuestClient {
  return {
    request: vi.fn(async () => {
      throw new DisplayQuestError({
        status,
        code: statusToCode(status),
        message: `erro ${status}`,
      })
    }),
  } as unknown as DisplayQuestClient
}

function toolByName(name: string): ToolDefinition {
  const tool = ALL_TOOL_DEFINITIONS.find((entry) => entry.name === name)
  if (!tool) throw new Error(`tool desconhecida: ${name}`)
  return tool
}

describe("catálogo de tools", () => {
  it("tem 15 leituras e 10 escritas, e as flags bateram com a contagem", () => {
    expect(ALL_TOOL_DEFINITIONS).toHaveLength(TOTAL_TOOL_COUNT)
    expect(READ_TOOL_COUNT).toBe(15)
    expect(WRITE_TOOL_COUNT).toBe(10)
    const readOnly = ALL_TOOL_DEFINITIONS.filter((tool) => tool.readOnly)
    expect(readOnly).toHaveLength(READ_TOOL_COUNT)
    expect(ALL_TOOL_DEFINITIONS.filter((tool) => !tool.readOnly)).toHaveLength(WRITE_TOOL_COUNT)
  })

  it("não tem nomes duplicados", () => {
    const names = ALL_TOOL_DEFINITIONS.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("toda tool tem título, descrição e retorno em português e schema de entrada", () => {
    for (const tool of ALL_TOOL_DEFINITIONS) {
      expect(tool.title.length).toBeGreaterThan(0)
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.returns.length).toBeGreaterThan(0)
      expect(tool.inputSchema).toBeDefined()
    }
  })
})

describe("execução das tools", () => {
  for (const tool of ALL_TOOL_DEFINITIONS) {
    const args = MINIMAL_ARGS[tool.name]
    if (!args) continue

    it(`${tool.name}: caminho feliz devolve structuredContent sem isError`, async () => {
      const result = await runTool(tool, args, { client: clientReturning(() => ({})) })
      expect(result.isError).toBeUndefined()
      expect(result.content[0]?.type).toBe("text")
      expect(result.structuredContent).toBeDefined()
    })

    const hasRequiredFields = Object.keys(args).length > 0
    if (hasRequiredFields) {
      it(`${tool.name}: entrada inválida vira invalid_input 400 local`, async () => {
        const result = await runTool(tool, {}, { client: clientReturning(() => ({})) })
        expect(result.isError).toBe(true)
        expect(result.structuredContent).toMatchObject({ status: 400, code: "invalid_input" })
      })
    }

    // member_performance nunca derruba a tool: falha de seção vira warning.
    if (tool.name !== "member_performance") {
      for (const status of [401, 403, 404]) {
        it(`${tool.name}: upstream ${status} vira ${statusToCode(status)}`, async () => {
          const result = await runTool(tool, args, { client: clientThrowing(status) })
          expect(result.isError).toBe(true)
          expect(result.structuredContent).toMatchObject({ status, code: statusToCode(status) })
        })
      }
    }
  }

  it("technical_report_generate: 503 do bucket vira bucket_unavailable", async () => {
    const result = await runTool(toolByName("technical_report_generate"), MINIMAL_ARGS.technical_report_generate, {
      client: clientThrowing(503),
    })
    expect(result.structuredContent).toMatchObject({ status: 503, code: "bucket_unavailable" })
  })

  it("technical_report_draft: 502 da IA vira ai_unavailable", async () => {
    const result = await runTool(toolByName("technical_report_draft"), MINIMAL_ARGS.technical_report_draft, {
      client: clientThrowing(502),
    })
    expect(result.structuredContent).toMatchObject({ status: 502, code: "ai_unavailable" })
  })

  it("technical_report_generate: 401 não é confundido com bucket fora do ar", async () => {
    const result = await runTool(toolByName("technical_report_generate"), MINIMAL_ARGS.technical_report_generate, {
      client: clientThrowing(401),
    })
    expect(result.structuredContent).toMatchObject({ status: 401, code: "upstream_unauthorized" })
  })

  it("member_performance: falha de seção vira warning e a tool continua verde", async () => {
    const result = await runTool(toolByName("member_performance"), MINIMAL_ARGS.member_performance, {
      client: clientThrowing(403),
    })
    expect(result.isError).toBeUndefined()
    const warnings = result.structuredContent?.warnings as Array<Record<string, unknown>>
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toMatchObject({ code: "upstream_forbidden", status: 403 })
  })
})

describe("people_list não devolve CPF nem senha", () => {
  it("remove cpf, password e passwordHash de cada usuário", async () => {
    const client = clientReturning(() => ({
      users: [
        { id: 1, name: "alvo", cpf: "12345678901", password: "x", passwordHash: "y", points: 10 },
      ],
    }))
    const result = await runTool(toolByName("people_list"), {}, { client })
    const users = result.structuredContent?.users as Array<Record<string, unknown>>
    expect(users[0]).not.toHaveProperty("cpf")
    expect(users[0]).not.toHaveProperty("password")
    expect(users[0]).not.toHaveProperty("passwordHash")
    expect(users[0]).toHaveProperty("points", 10)
  })
})
