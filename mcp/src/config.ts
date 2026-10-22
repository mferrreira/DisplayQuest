export interface McpConfig {
  appBaseUrl: string
  agentEmail: string
  agentPassword: string
  port: number
  bindIp: string
  requestTimeoutMs: number
  /** DOCX e outros binários podem demorar o dobro do JSON (§V7-1.4). */
  binaryRequestTimeoutMs: number
  allowedOriginHostnames: string[]
}

export const DEFAULT_AGENT_EMAIL = "mcp-agent@displayquest.local"
export const DEFAULT_APP_BASE_URL = "http://127.0.0.1:3000"
export const DEFAULT_PORT = 8787
export const DEFAULT_BIND_IP = "127.0.0.1"
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
export const BINARY_TIMEOUT_MULTIPLIER = 2

/** V7-1.3: a sessão da conta de serviço é renovada proativamente a cada 24 h. */
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000

const LOOPBACK_ORIGIN_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"]
const WILDCARD_BIND_IPS = new Set(["0.0.0.0", "::", ""])

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "")
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} precisa ser um inteiro positivo`)
  }
  return parsed
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim()
  }
  return undefined
}

/** Aceita hostname puro (`qd.local`) ou origem completa (`http://qd.local:8787`). */
function toHostname(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === "") return undefined
  try {
    return new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`).hostname
  } catch {
    return undefined
  }
}

export function parseAllowedOriginHostnames(
  raw: string | undefined,
  bindIp: string,
): string[] {
  const hosts = new Set(LOOPBACK_ORIGIN_HOSTNAMES)
  if (!WILDCARD_BIND_IPS.has(bindIp.trim())) {
    const bindHost = toHostname(bindIp)
    if (bindHost) hosts.add(bindHost)
  }
  for (const entry of (raw ?? "").split(",")) {
    const host = toHostname(entry)
    if (host) hosts.add(host)
  }
  return [...hosts]
}

/**
 * Lê a configuração do processo. A senha só entra por env e nunca é devolvida por
 * tool, logada ou serializada. `DQ_AGENT_PASSWORD` é o nome do plan-v7;
 * `MCP_AGENT_PASSWORD` fica como alias de compatibilidade; `DASHBOARD_BASE_URL` e
 * `MCP_APP_URL` seguem aceitos como alias do endereço do app.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const agentPassword = firstNonEmpty(env.DQ_AGENT_PASSWORD, env.MCP_AGENT_PASSWORD)
  if (!agentPassword) {
    throw new Error("DQ_AGENT_PASSWORD não definida — configure a senha da conta de serviço")
  }

  const bindIp = firstNonEmpty(env.MCP_BIND_IP) ?? DEFAULT_BIND_IP

  const requestTimeoutMs = parsePositiveInteger(
    env.MCP_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    "MCP_REQUEST_TIMEOUT_MS",
  )

  return {
    appBaseUrl: normalizeBaseUrl(
      firstNonEmpty(env.DQ_API_BASE, env.DASHBOARD_BASE_URL, env.MCP_APP_URL) ??
        DEFAULT_APP_BASE_URL,
    ),
    agentEmail: firstNonEmpty(env.DQ_AGENT_EMAIL, env.MCP_AGENT_EMAIL) ?? DEFAULT_AGENT_EMAIL,
    agentPassword,
    port: parsePositiveInteger(env.MCP_PORT, DEFAULT_PORT, "MCP_PORT"),
    bindIp,
    requestTimeoutMs,
    binaryRequestTimeoutMs: requestTimeoutMs * BINARY_TIMEOUT_MULTIPLIER,
    allowedOriginHostnames: parseAllowedOriginHostnames(env.DQ_ALLOWED_ORIGINS, bindIp),
  }
}
