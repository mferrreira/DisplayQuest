/**
 * Vocabulário de erro do caminho MCP, fixado no §7.3 do plan-v7. O `code` sai no
 * `structuredContent` de toda tool que falha; o `status` é o HTTP que o upstream usou
 * (ou o mais próximo dele) e serve para o consumidor distinguir 4xx de 5xx.
 */
export type ErrorCode =
  | "invalid_input"
  | "upstream_auth_failed"
  | "upstream_unauthorized"
  | "upstream_forbidden"
  | "not_found"
  | "conflict"
  | "upstream_error"
  | "ai_unavailable"
  | "bucket_unavailable"
  | "internal_error"

export interface ToolErrorContent {
  status: number
  code: ErrorCode
  message: string
}

export interface ToolErrorInit {
  status: number
  code: ErrorCode
  message: string
  details?: unknown
}

/**
 * Erro do caminho MCP. `message` é a frase do app (já segura) ou uma frase própria;
 * `details` nunca entra na resposta da tool e existe só para depuração interna.
 */
export class DisplayQuestError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly details?: unknown

  constructor(init: ToolErrorInit) {
    super(init.message)
    this.name = "DisplayQuestError"
    this.status = init.status
    this.code = init.code
    this.details = init.details
  }

  toToolContent(): ToolErrorContent {
    return { status: this.status, code: this.code, message: this.message }
  }
}

export function statusToCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return "invalid_input"
    case 401:
      return "upstream_unauthorized"
    case 403:
      return "upstream_forbidden"
    case 404:
      return "not_found"
    case 409:
      return "conflict"
    default:
      return status >= 500 ? "upstream_error" : "internal_error"
  }
}

/**
 * Reescreve o `code` de um erro de upstream preservando status, mensagem e details.
 * `ai_unavailable` (502 do rascunho) e `bucket_unavailable` (503 da geração/leitura)
 * são decisões do chamador: o mesmo status significa coisas diferentes por rota.
 */
export function recode(error: unknown, code: ErrorCode): unknown {
  if (error instanceof DisplayQuestError) {
    return new DisplayQuestError({
      status: error.status,
      code,
      message: error.message,
      details: error.details,
    })
  }
  return error
}

export function toToolErrorContent(error: unknown): ToolErrorContent {
  if (error instanceof DisplayQuestError) return error.toToolContent()
  return {
    status: 500,
    code: "internal_error",
    message: "Erro interno do servidor MCP",
  }
}
