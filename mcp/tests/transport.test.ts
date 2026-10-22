import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createMcpHttpServer } from "../src/index.js"
import type { McpConfig } from "../src/config.js"
import type { DisplayQuestClient } from "../src/displayquest-client.js"

const fakeClient = {
  request: async () => ({}),
} as unknown as DisplayQuestClient

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

let server: http.Server
let base: string

beforeAll(async () => {
  server = createMcpHttpServer(config, fakeClient)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address() as AddressInfo
  base = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function post(body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "teste", version: "0.0.1" },
  },
}

describe("transporte HTTP", () => {
  it("GET /healthz responde status, upstream e versão sem segredo", async () => {
    const response = await fetch(`${base}/healthz`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toEqual({ status: "ok", upstream: "http://app.test", version: "0.1.0" })
  })

  it("GET e DELETE em /mcp respondem 405 com Allow: POST", async () => {
    for (const method of ["GET", "DELETE"]) {
      const response = await fetch(`${base}/mcp`, { method })
      expect(response.status).toBe(405)
      expect(response.headers.get("allow")).toBe("POST")
    }
  })

  it("qualquer outra rota responde 404", async () => {
    const response = await fetch(`${base}/outra-coisa`)
    expect(response.status).toBe(404)
  })

  it("Origin de fora da lista responde 403", async () => {
    const response = await post(INITIALIZE, { Origin: "http://malicioso.teste" })
    expect(response.status).toBe(403)
  })

  it("sem Origin (curl, cliente 2025-era) passa pela guarda e inicializa", async () => {
    const response = await post(INITIALIZE)
    expect(response.status).toBe(200)
    // Com Accept: text/event-stream o estado sem sessão responde SSE; o payload
    // vem na linha `data:` do evento.
    const text = await response.text()
    expect(text).toContain('"protocolVersion"')
  })

  it("versão explícita não suportada responde 400 com -32020", async () => {
    const response = await post(
      { ...INITIALIZE, params: { ...INITIALIZE.params, protocolVersion: "2099-01-01" } },
      { "MCP-Protocol-Version": "2099-01-01", "Mcp-Method": "initialize" },
    )
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error?: { code?: number } }
    expect(body.error?.code).toBe(-32020)
  })

  it("rota moderna sem Mcp-Method responde 400", async () => {
    const response = await post(INITIALIZE, { "MCP-Protocol-Version": "2026-07-28" })
    expect(response.status).toBe(400)
  })

  it("tools/call moderno sem Mcp-Name responde 400", async () => {
    const response = await post(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "project_list", arguments: {} } },
      { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call" },
    )
    expect(response.status).toBe(400)
  })

  it("JSON inválido responde 400 com -32700", async () => {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: "{isso não é json",
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error?: { code?: number } }
    expect(body.error?.code).toBe(-32700)
  })
})
