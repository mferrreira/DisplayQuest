import { DisplayQuestError, statusToCode } from "./errors.js"
import { SESSION_RENEW_AFTER_MS, type McpConfig } from "./config.js"

export type FetchLike = typeof fetch

export interface BinaryResponse {
  bytes: Uint8Array
  contentType: string
  fileName: string | null
}

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  auth?: boolean
  retryOn401?: boolean
}

function readSetCookie(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof withGetSetCookie.getSetCookie === "function") return withGetSetCookie.getSetCookie()
  const raw = headers.get("set-cookie")
  return raw ? [raw] : []
}

class InMemoryCookieJar {
  private readonly cookies = new Map<string, string>()

  storeFrom(response: Response): void {
    for (const line of readSetCookie(response.headers)) {
      const pair = line.split(";")[0] ?? ""
      const separator = pair.indexOf("=")
      if (separator <= 0) continue
      const name = pair.slice(0, separator).trim()
      const value = pair.slice(separator + 1).trim()
      const lower = line.toLowerCase()
      const expired = value === "" || lower.includes("max-age=0")
      if (expired) {
        this.cookies.delete(name)
        continue
      }
      this.cookies.set(name, value)
    }
  }

  header(): string | undefined {
    if (this.cookies.size === 0) return undefined
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ")
  }

  hasSessionCookie(): boolean {
    return [...this.cookies.keys()].some(
      (name) =>
        name === "next-auth.session-token" ||
        name === "__Secure-next-auth.session-token" ||
        name.startsWith("next-auth.session-token.") ||
        name.startsWith("__Secure-next-auth.session-token."),
    )
  }

  clear(): void {
    this.cookies.clear()
  }
}

function unwrap(body: unknown): unknown {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const keys = Object.keys(body as Record<string, unknown>)
    if (keys.length === 1 && keys[0] === "data") {
      return (body as Record<string, unknown>).data
    }
  }
  return body
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    if (typeof record.error === "string" && record.error.trim() !== "") return record.error
    if (Array.isArray(record.error)) {
      const joined = record.error.filter((item) => typeof item === "string").join("; ")
      if (joined !== "") return joined
    }
    if (typeof record.message === "string" && record.message.trim() !== "") return record.message
  }
  return fallback
}

function extractFileName(disposition: string | null): string | null {
  if (!disposition) return null
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  return match?.[1] ?? null
}

/**
 * Cliente HTTP do DisplayQuest com sessão em memória.
 *
 * O login é o caminho normal do NextAuth v4: pega o CSRF token em
 * `/api/auth/csrf`, faz `POST /api/auth/callback/credentials` e guarda só os
 * cookies de sessão. Nada de senha é persistido ou devolvido; um 401 limpa a
 * sessão e tenta o login uma única vez antes de falhar.
 */
export class DisplayQuestClient {
  private readonly jar = new InMemoryCookieJar()
  private sessionPromise: Promise<void> | null = null
  private sessionStartedAt: number | null = null

  constructor(
    private readonly config: McpConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  isAuthenticated(): boolean {
    return this.jar.hasSessionCookie()
  }

  clearSession(): void {
    this.jar.clear()
    this.sessionPromise = null
    this.sessionStartedAt = null
  }

  /** V7-1.3: sessão vencida pela idade é renovada antes de a próxima chamada sair. */
  private needsRelogin(): boolean {
    if (!this.jar.hasSessionCookie()) return true
    if (this.sessionStartedAt === null) return false
    return this.now() - this.sessionStartedAt >= SESSION_RENEW_AFTER_MS
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = new URL(`${this.config.appBaseUrl}${path}`)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue
        url.searchParams.set(key, String(value))
      }
    }
    return url.toString()
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number = this.config.requestTimeoutMs,
  ): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) {
      throw new DisplayQuestError({
        status: 504,
        code: "upstream_error",
        message: "Tempo esgotado ao falar com o DisplayQuest",
      })
    }
    throw new DisplayQuestError({
      status: 502,
      code: "upstream_error",
      message: "Não foi possível falar com o DisplayQuest",
      details: error,
    })
    } finally {
      clearTimeout(timer)
    }
  }

  async ensureSession(): Promise<void> {
    if (!this.needsRelogin()) return
    if (!this.sessionPromise) {
      this.jar.clear()
      this.sessionStartedAt = null
      this.sessionPromise = this.performLogin()
    }
    const pending = this.sessionPromise
    try {
      await pending
    } finally {
      // single-flight: a promise assentada libera o slot para a renovação de 24 h
      // e para a nova tentativa depois de uma falha.
      if (this.sessionPromise === pending) this.sessionPromise = null
    }
  }

  async login(): Promise<void> {
    this.clearSession()
    await this.ensureSession()
  }

  private async performLogin(): Promise<void> {
    const csrfUrl = this.buildUrl("/api/auth/csrf")
    const csrfResponse = await this.fetchWithTimeout(csrfUrl, {
      method: "GET",
      headers: { Accept: "application/json", Cookie: this.jar.header() ?? "" },
      redirect: "manual",
    })
    this.jar.storeFrom(csrfResponse)

    let csrfToken: string | undefined
    try {
      const csrfBody = (await csrfResponse.json()) as { csrfToken?: string }
      csrfToken = csrfBody.csrfToken
    } catch {
      csrfToken = undefined
    }
    if (!csrfToken) {
      throw new DisplayQuestError({
        status: 401,
        code: "upstream_auth_failed",
        message: "Falha ao obter o token CSRF do DisplayQuest",
      })
    }

    const body = new URLSearchParams({
      csrfToken,
      email: this.config.agentEmail,
      password: this.config.agentPassword,
      callbackUrl: `${this.config.appBaseUrl}/dashboard`,
      json: "true",
    })

    const callbackResponse = await this.fetchWithTimeout(
      this.buildUrl("/api/auth/callback/credentials"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Cookie: this.jar.header() ?? "",
        },
        body: body.toString(),
        redirect: "manual",
      },
    )
    this.jar.storeFrom(callbackResponse)

    if (callbackResponse.status >= 400) {
      throw new DisplayQuestError({
        status: 401,
        code: "upstream_auth_failed",
        message: "Credenciais da conta de serviço recusadas pelo DisplayQuest",
      })
    }

    if (!this.jar.hasSessionCookie()) {
      const sessionResponse = await this.fetchWithTimeout(this.buildUrl("/api/auth/session"), {
        method: "GET",
        headers: { Accept: "application/json", Cookie: this.jar.header() ?? "" },
        redirect: "manual",
      })
      this.jar.storeFrom(sessionResponse)
    }

    if (!this.jar.hasSessionCookie()) {
      throw new DisplayQuestError({
        status: 401,
        code: "upstream_auth_failed",
        message: "A sessão da conta de serviço não foi criada",
      })
    }

    this.sessionStartedAt = this.now()
  }

  async request<T = unknown>(options: RequestOptions): Promise<T> {
    const useAuth = options.auth !== false
    if (useAuth) await this.ensureSession()

    const url = this.buildUrl(options.path, options.query)
    const headers: Record<string, string> = { Accept: "application/json" }
    const cookie = this.jar.header()
    if (cookie) headers.Cookie = cookie
    let body: string | undefined
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(options.body)
    }

    let response = await this.fetchWithTimeout(url, {
      method: options.method,
      headers,
      body,
      redirect: "manual",
    })

    if (response.status === 401 && useAuth && options.retryOn401 !== false) {
      this.clearSession()
      await this.ensureSession()
      const retryHeaders: Record<string, string> = { Accept: "application/json" }
      const retryCookie = this.jar.header()
      if (retryCookie) retryHeaders.Cookie = retryCookie
      if (options.body !== undefined) {
        retryHeaders["Content-Type"] = "application/json"
      }
      response = await this.fetchWithTimeout(url, {
        method: options.method,
        headers: retryHeaders,
        body,
        redirect: "manual",
      })
    }

    return this.parseJsonResponse<T>(response)
  }

  private async parseJsonResponse<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T

    const contentType = response.headers.get("content-type") ?? ""
    let parsed: unknown
    if (contentType.includes("application/json")) {
      parsed = await response.json().catch(() => undefined)
    } else {
      const text = await response.text()
      parsed = text === "" ? undefined : { message: text }
    }

    if (!response.ok) {
      throw new DisplayQuestError({
        status: response.status,
        code: statusToCode(response.status),
        message: extractErrorMessage(parsed, response.statusText || "Erro no DisplayQuest"),
        details: parsed,
      })
    }

    return unwrap(parsed) as T
  }

  async requestBinary(options: RequestOptions): Promise<BinaryResponse> {
    const useAuth = options.auth !== false
    if (useAuth) await this.ensureSession()

    let response = await this.fetchWithTimeout(
      this.buildUrl(options.path, options.query),
      {
        method: options.method,
        headers: { Accept: "*/*", Cookie: this.jar.header() ?? "" },
        redirect: "manual",
      },
      this.config.binaryRequestTimeoutMs,
    )

    if (response.status === 401 && useAuth && options.retryOn401 !== false) {
      this.clearSession()
      await this.ensureSession()
      response = await this.fetchWithTimeout(
        this.buildUrl(options.path, options.query),
        {
          method: options.method,
          headers: { Accept: "*/*", Cookie: this.jar.header() ?? "" },
          redirect: "manual",
        },
        this.config.binaryRequestTimeoutMs,
      )
    }

    if (!response.ok) {
      await this.parseJsonResponse(response)
    }

    const buffer = await response.arrayBuffer()
    return {
      bytes: new Uint8Array(buffer),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      fileName: extractFileName(response.headers.get("content-disposition")),
    }
  }
}
