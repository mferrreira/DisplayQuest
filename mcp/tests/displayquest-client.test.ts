import { describe, expect, it, vi } from "vitest"

import { SESSION_RENEW_AFTER_MS, type McpConfig } from "../src/config.js"
import { DisplayQuestClient, type FetchLike } from "../src/displayquest-client.js"
import { DisplayQuestError } from "../src/errors.js"

function testConfig(overrides: Partial<McpConfig> = {}): McpConfig {
  return {
    appBaseUrl: "http://app.test",
    agentEmail: "mcp-agent@displayquest.local",
    agentPassword: "senha-de-teste",
    port: 8787,
    bindIp: "127.0.0.1",
    requestTimeoutMs: 15_000,
    binaryRequestTimeoutMs: 30_000,
    allowedOriginHostnames: ["localhost"],
    ...overrides,
  }
}

function json(body: unknown, status = 200, headers?: Headers): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers ?? new Headers({ "content-type": "application/json" }),
  })
}

function loginFetch(overrides?: (url: string) => Response | undefined) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl: FetchLike = vi.fn(async (url, init) => {
    const u = String(url)
    calls.push({ url: u, init: init ?? {} })
    const override = overrides?.(u)
    if (override) return override
    if (u.includes("/api/auth/csrf")) {
      const headers = new Headers({ "content-type": "application/json" })
      headers.append("set-cookie", "dq-csrf=abc; Path=/")
      return new Response(JSON.stringify({ csrfToken: "tok" }), { status: 200, headers })
    }
    if (u.includes("/api/auth/callback/credentials")) {
      const headers = new Headers()
      headers.append("set-cookie", "next-auth.session-token=sess1; Path=/; HttpOnly")
      headers.append("set-cookie", "next-auth.callback-url=http://app.test; Path=/")
      return new Response(null, { status: 302, headers })
    }
    if (u.includes("/api/users")) {
      return json({ data: [{ id: 1, name: "alvo" }] })
    }
    return json({}, 404)
  })
  return { fetchImpl, calls }
}

describe("DisplayQuestClient", () => {
  it("guarda os dois Set-Cookie e os envia juntos na chamada autenticada", async () => {
    const { fetchImpl, calls } = loginFetch()
    const client = new DisplayQuestClient(testConfig(), fetchImpl)

    await client.request({ method: "GET", path: "/api/users" })

    const usersCall = calls.find((call) => call.url.includes("/api/users"))
    const cookie = String((usersCall?.init.headers as Record<string, string>).Cookie)
    expect(cookie).toContain("next-auth.session-token=sess1")
    expect(cookie).toContain("next-auth.callback-url=")
    expect(cookie).toContain("dq-csrf=abc")
  })

  it("login pega o CSRF e envia as credenciais no callback", async () => {
    const { fetchImpl, calls } = loginFetch()
    const client = new DisplayQuestClient(testConfig(), fetchImpl)

    await client.request({ method: "GET", path: "/api/users" })

    const callback = calls.find((call) => call.url.includes("/api/auth/callback/credentials"))
    expect(callback).toBeDefined()
    const body = String(callback?.init.body)
    expect(body).toContain("csrfToken=tok")
    expect(body).toContain("email=mcp-agent%40displayquest.local")
    expect(body).toContain("password=senha-de-teste")
  })

  it("401 limpa a sessão e repete a chamada uma única vez", async () => {
    let usersAttempts = 0
    const { fetchImpl, calls } = loginFetch((url) => {
      if (url.includes("/api/users")) {
        usersAttempts += 1
        return usersAttempts === 1 ? json({ error: "Não autorizado" }, 401) : json({ data: [] })
      }
      return undefined
    })
    const client = new DisplayQuestClient(testConfig(), fetchImpl)

    await client.request({ method: "GET", path: "/api/users" })

    expect(usersAttempts).toBe(2)
    expect(calls.filter((call) => call.url.includes("/api/auth/csrf"))).toHaveLength(2)
  })

  it("duas chamadas concorrentes fazem um único login (single-flight)", async () => {
    const { fetchImpl, calls } = loginFetch()
    const client = new DisplayQuestClient(testConfig(), fetchImpl)

    await Promise.all([
      client.request({ method: "GET", path: "/api/users" }),
      client.request({ method: "GET", path: "/api/users" }),
    ])

    expect(calls.filter((call) => call.url.includes("/api/auth/csrf"))).toHaveLength(1)
  })

  it("renova a sessão proativamente depois de 24 h (V7-1.3)", async () => {
    const { fetchImpl, calls } = loginFetch()
    let now = 1_000_000
    const client = new DisplayQuestClient(testConfig(), fetchImpl, () => now)

    await client.request({ method: "GET", path: "/api/users" })
    expect(calls.filter((call) => call.url.includes("/api/auth/csrf"))).toHaveLength(1)

    now += SESSION_RENEW_AFTER_MS - 1
    await client.request({ method: "GET", path: "/api/users" })
    expect(calls.filter((call) => call.url.includes("/api/auth/csrf"))).toHaveLength(1)

    now += 1
    await client.request({ method: "GET", path: "/api/users" })
    expect(calls.filter((call) => call.url.includes("/api/auth/csrf"))).toHaveLength(2)
  })

  it("credencial recusada vira upstream_auth_failed e não vaza a senha", async () => {
    const { fetchImpl } = loginFetch((url) =>
      url.includes("/api/auth/callback/credentials")
        ? json({ error: "Credenciais inválidas" }, 401)
        : undefined,
    )
    const client = new DisplayQuestClient(testConfig(), fetchImpl)

    const error = await client
      .request({ method: "GET", path: "/api/users" })
      .catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(DisplayQuestError)
    const failure = error as DisplayQuestError
    expect(failure.code).toBe("upstream_auth_failed")
    expect(failure.status).toBe(401)
    expect(failure.message).not.toContain("senha-de-teste")
  })

  it("rede fora do ar vira upstream_error 502", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new TypeError("fetch failed")
    })
    const client = new DisplayQuestClient(testConfig(), fetchImpl)

    const error = (await client
      .request({ method: "GET", path: "/api/users" })
      .catch((thrown: unknown) => thrown)) as DisplayQuestError

    expect(error.code).toBe("upstream_error")
    expect(error.status).toBe(502)
  })

  it("tempo esgotado vira upstream_error 504", async () => {
    const fetchImpl: FetchLike = vi.fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
        }),
    )
    const client = new DisplayQuestClient(testConfig({ requestTimeoutMs: 50 }), fetchImpl)

    const error = (await client
      .request({ method: "GET", path: "/api/users" })
      .catch((thrown: unknown) => thrown)) as DisplayQuestError

    expect(error.code).toBe("upstream_error")
    expect(error.status).toBe(504)
  })
})
