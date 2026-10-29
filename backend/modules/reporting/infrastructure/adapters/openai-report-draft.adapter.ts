import type { ReportDraftPort } from "@/backend/modules/reporting/application/ports/report-draft.port"

/**
 * OpenAiReportDraftAdapter — cliente OpenAI-compatible do rascunho (V5-9c, DEC-139/152).
 *
 * Por env, no desenho medido do bucket (DEC-131): `AI_BASE_URL` (default
 * `http://localhost:8080/v1` — DEC-152 mediu o servidor da IA respondendo em
 * localhost:8080 no deploy e na tailscale no dev), `AI_API_KEY` (opcional — o servidor
 * local não exige auth; a header só sai quando a env existe) e `AI_MODEL` (default
 * `local`). O container do app alcança a IA pela env, não por default: quem opera
 * configura `AI_BASE_URL` no `.env`.
 *
 * Falha de conexão, HTTP de erro ou resposta sem conteúdo viram `Error` com a frase
 * "IA indisponível" — a rota traduz para 502 (não é DomainError: o padrão de serviço
 * não é recusa de pessoa). A suíte de unit nunca passa por aqui: a porta é injetável.
 */

export interface ReportDraftEnvConfig {
  baseUrl: string
  apiKey: string | null
  model: string
}

export function reportDraftConfigFromEnv(): ReportDraftEnvConfig {
  // String VAZA conta como ausente: o compose passa `AI_BASE_URL=${AI_BASE_URL:-}` e
  // `??` não pega "" — sem o `||`, o pedido sairia para `/chat/completions` relativo.
  return {
    baseUrl: (process.env.AI_BASE_URL?.trim() || "http://localhost:8080/v1").replace(/\/+$/, ""),
    apiKey: process.env.AI_API_KEY?.trim() || null,
    model: process.env.AI_MODEL?.trim() || "local",
  }
}

export class OpenAiReportDraftAdapter implements ReportDraftPort {
  constructor(private readonly config: ReportDraftEnvConfig = reportDraftConfigFromEnv()) {}

  async generateDraft(prompt: string): Promise<string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`
    }

    let response: Response
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: "system",
              content:
                "Você escreve o corpo de relatórios técnicos de Iniciação Científica em português, em texto puro.",
            },
            { role: "user", content: prompt },
          ],
        }),
      })
    } catch {
      throw new Error(`IA indisponível em ${this.config.baseUrl} — verifique AI_BASE_URL`)
    }

    if (!response.ok) {
      throw new Error(`IA indisponível: HTTP ${response.status}`)
    }

    const payload: unknown = await response.json()
    const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]
      ?.message?.content
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("IA indisponível: resposta sem conteúdo")
    }
    return content.trim()
  }
}