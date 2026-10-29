import { McpServer, type CallToolResult } from "@modelcontextprotocol/server"

import type { DisplayQuestClient } from "./displayquest-client.js"
import { registerTechnicalReportFileResource } from "./resources/technical-report-file.js"
import { ALL_TOOL_DEFINITIONS } from "./tools/index.js"
import { runTool } from "./tools/result.js"

export const MCP_SERVER_NAME = "displayquest-validation"
export const MCP_SERVER_VERSION = "0.1.0"

/**
 * As 25 tools do plan-v7 sobre uma única sessão da conta de serviço. A anotação
 * `readOnlyHint` vem do catálogo; `destructiveHint: false` é sempre verdade porque
 * nenhuma tool apaga dado — as escritas criam ou editam registros do projeto de areia.
 */
export function createServer(client: DisplayQuestClient): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION })

  for (const tool of ALL_TOOL_DEFINITIONS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: false,
        },
      },
      async (args) => (await runTool(tool, args, { client })) as CallToolResult,
    )
  }

  registerTechnicalReportFileResource(server, client)
  return server
}
