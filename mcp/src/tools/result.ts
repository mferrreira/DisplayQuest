import { DisplayQuestError, toToolErrorContent } from "../errors.js"
import type { AnyZodObject, ToolContext, ToolDefinition } from "./types.js"

export interface TextContentBlock {
  type: "text"
  text: string
}

export interface ToolResult {
  content: TextContentBlock[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

const MAX_SUMMARY_CHARS = 1500

/**
 * `content` é a leitura curta que o agente vê primeiro: contagens e chaves, não o
 * documento inteiro — o JSON completo vai em `structuredContent`.
 */
export function summarize(data: unknown): string {
  const lines: string[] = []
  const record = toStructured(data)
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: ${value.length} item(ns)`)
    } else if (value && typeof value === "object") {
      lines.push(`${key}: {${Object.keys(value as Record<string, unknown>).join(", ")}}`)
    } else {
      lines.push(`${key}: ${String(value)}`)
    }
  }
  const text = lines.join("\n")
  return text.length > MAX_SUMMARY_CHARS ? `${text.slice(0, MAX_SUMMARY_CHARS)}…` : text
}

export function toStructured(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return { result: data }
}

export function successResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: summarize(data) }],
    structuredContent: toStructured(data),
  }
}

export function errorResult(error: unknown): ToolResult {
  const content = toToolErrorContent(error)
  return {
    content: [{ type: "text", text: `${content.code} (${content.status}): ${content.message}` }],
    structuredContent: { ...content },
    isError: true,
  }
}

function firstIssue(error: unknown): string {
  const issues = (error as { issues?: Array<{ message?: string; path?: unknown[] }> }).issues
  const issue = issues?.[0]
  if (!issue) return "Entrada inválida"
  const path = Array.isArray(issue.path) && issue.path.length > 0 ? `${issue.path.join(".")}: ` : ""
  return `${path}${issue.message ?? "valor inválido"}`
}

/**
 * Executa uma tool: valida a entrada com o Zod do próprio contrato e nunca lança para
 * fora do callback — falha vira `isError: true` com `{status, code, message}`.
 *
 * O caminho HTTP moderno (2026-07-28) rejeita entrada inválida antes de chegar aqui,
 * então `invalid_input` é sobretudo o contrato do handler chamado direto (testes).
 */
export async function runTool<Schema extends AnyZodObject>(
  tool: ToolDefinition<Schema>,
  args: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const parsed = tool.inputSchema.safeParse(args ?? {})
  if (!parsed.success) {
    return errorResult(
      new DisplayQuestError({
        status: 400,
        code: "invalid_input",
        message: firstIssue(parsed.error),
      }),
    )
  }

  try {
    return successResult(await tool.handler(parsed.data, ctx))
  } catch (error) {
    return errorResult(error)
  }
}
