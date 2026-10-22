import http from "node:http"
import { pathToFileURL } from "node:url"

import { createMcpHandler } from "@modelcontextprotocol/server"
import { originValidation, toNodeHandler } from "@modelcontextprotocol/node"

import { loadConfig, type McpConfig } from "./config.js"
import { DisplayQuestClient } from "./displayquest-client.js"
import { createServer, MCP_SERVER_VERSION } from "./server.js"

/**
 * O handler do SDK é deliberadamente sem validação de Origin/Host: a guarda entra
 * na frente. Host não é validado de propósito — em LAN o Host é o IP do host e
 * validá-lo quebraria o acesso do time.
 */
export function createMcpHttpServer(config: McpConfig, client: DisplayQuestClient): http.Server {
  const checkOrigin = originValidation(config.allowedOriginHostnames)
  const handleMcp = toNodeHandler(createMcpHandler(() => createServer(client)))

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)

    if (url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ status: "ok", upstream: config.appBaseUrl, version: MCP_SERVER_VERSION }))
      return
    }

    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Rota não encontrada" }))
      return
    }

    // Fase 1: só Streamable HTTP em POST. GET/DELETE em /mcp respondem 405 com Allow.
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" })
      res.end()
      return
    }

    if (!checkOrigin(req, res)) return

    await handleMcp(req, res)
  })
}

function main(): void {
  const config = loadConfig()
  const client = new DisplayQuestClient(config)
  const httpServer = createMcpHttpServer(config, client)

  httpServer.listen(config.port, config.bindIp, () => {
    console.log(`MCP DisplayQuest em http://${config.bindIp}:${config.port}/mcp (upstream ${config.appBaseUrl})`)
  })

  const shutdown = (signal: string): void => {
    console.log(`recebido ${signal}, encerrando o servidor MCP`)
    httpServer.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 5_000).unref()
  }

  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
