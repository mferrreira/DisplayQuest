import http from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"

import { createMcpHttpServer } from "../src/index.js"
import { DOCX_MIME_TYPE, TECHNICAL_REPORT_FILE_URI_TEMPLATE } from "../src/resources/technical-report-file.js"
import type { McpConfig } from "../src/config.js"
import type { BinaryResponse, DisplayQuestClient } from "../src/displayquest-client.js"

interface ContractTool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean; destructiveHint: boolean }
  returns: string
  errors: number[]
}

interface Contract {
  name: string
  version: string
  protocolVersion: string
  endpoint: string
  transport: string
  clientAuth: { mode: string; scope: string }
  tools: ContractTool[]
  resources: Array<{ uriTemplate: string; mimeType: string }>
}

const contract: Contract = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "tools.json"), "utf8"),
) as Contract

const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04])

const fakeClient = {
  request: async () => ({}),
  requestBinary: async (): Promise<BinaryResponse> => ({
    bytes: DOCX_BYTES,
    contentType: DOCX_MIME_TYPE,
    fileName: "relatorio.docx",
  }),
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
let client: Client

beforeAll(async () => {
  server = createMcpHttpServer(config, fakeClient)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address() as AddressInfo
  client = new Client({ name: "teste-contrato", version: "0.0.1" })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)),
  )
})

afterAll(async () => {
  await client?.close().catch(() => {})
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe("contrato tools.json ↔ servidor", () => {
  it("tools/list bate com tools.json em nome, título, descrição, anotações e schema", async () => {
    const listed = await client.listTools()
    expect(listed.tools).toHaveLength(contract.tools.length)

    for (const expected of contract.tools) {
      const actual = listed.tools.find((tool) => tool.name === expected.name)
      expect(actual, `tool ausente: ${expected.name}`).toBeDefined()
      expect(actual?.title).toBe(expected.title)
      expect(actual?.description).toBe(expected.description)
      expect(actual?.annotations).toMatchObject(expected.annotations)
      // Dialeto de JSON Schema: o Zod anuncia `$schema` e `additionalProperties: false`
      // em todo nível, o tools/list do SDK não. O contrato compara o formato emitido.
      const normalize = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(normalize)
        if (value && typeof value === "object") {
          const entries: Record<string, unknown> = {}
          for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            if (key === "$schema" || key === "additionalProperties") continue
            entries[key] = normalize(entry)
          }
          return entries
        }
        return value
      }
      expect(normalize(actual?.inputSchema ?? {})).toEqual(normalize(expected.inputSchema))
    }
  })

  it("tools.json declara 15 leituras e 10 escritas", () => {
    const readOnly = contract.tools.filter((tool) => tool.annotations.readOnlyHint)
    expect(readOnly).toHaveLength(15)
    expect(contract.tools.filter((tool) => !tool.annotations.readOnlyHint)).toHaveLength(10)
    for (const tool of contract.tools) {
      expect(tool.annotations.destructiveHint).toBe(false)
    }
  })

  it("resources/templates/list publica o template do DOCX do contrato", async () => {
    const templates = await client.listResourceTemplates()
    const template = templates.resourceTemplates.find(
      (entry) => entry.uriTemplate === TECHNICAL_REPORT_FILE_URI_TEMPLATE,
    )
    expect(template).toBeDefined()
    expect(contract.resources[0]?.uriTemplate).toBe(TECHNICAL_REPORT_FILE_URI_TEMPLATE)
    expect(contract.resources[0]?.mimeType).toBe(DOCX_MIME_TYPE)
  })

  it("resources/read do DOCX devolve blob base64 com o mime do contrato", async () => {
    const result = await client.readResource({
      uri: "dq://projects/1/technical-reports/2/file?userId=3",
    })
    expect(result.contents).toHaveLength(1)
    const content = result.contents[0] as { uri: string; mimeType?: string; blob?: string }
    expect(content.uri).toBe("dq://projects/1/technical-reports/2/file?userId=3")
    expect(content.mimeType).toBe(DOCX_MIME_TYPE)
    expect(content.blob).toBe(Buffer.from(DOCX_BYTES).toString("base64"))
  })

  it("resources/read com id inválido responde erro de protocolo", async () => {
    await expect(
      client.readResource({ uri: "dq://projects/abc/technical-reports/2/file?userId=3" }),
    ).rejects.toThrow()
  })
})
