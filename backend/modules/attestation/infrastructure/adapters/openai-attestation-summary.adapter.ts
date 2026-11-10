import type { AttestationSummaryPort } from "../../application/ports/attestation-summary.port";
import type { AttestationSessionLogRow } from "../../application/ports/attestation-sources.port";
import { summarizeAttestationSessionLogs } from "@/backend/domain";

/** Summarizes monthly work logs through the configured OpenAI-compatible service. */
export class OpenAiAttestationSummaryAdapter implements AttestationSummaryPort {
  async summarize(rows: AttestationSessionLogRow[]): Promise<string | null> {
    const fallback = summarizeAttestationSessionLogs(rows);
    if (!fallback) return null;
    const baseUrl = (process.env.AI_BASE_URL?.trim() || "http://localhost:8080/v1").replace(/\/+$/, "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const apiKey = process.env.AI_API_KEY?.trim();
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model: process.env.AI_MODEL?.trim() || "local",
          temperature: 0.2,
          max_tokens: 240,
          chat_template_kwargs: { enable_thinking: false },
          messages: [
            { role: "system", content: "Produza síntese institucional em português, impessoal e gramaticalmente correta. Agrupe ações relacionadas em temas amplos sem enumerar cada anotação. Use apenas fatos fornecidos. Responda com uma única frase de até 180 caracteres, sem ponto e vírgula." },
            { role: "user", content: `Sintetize estas atividades mensais para um atestado.\n${JSON.stringify(rows.map(({ activity, note }) => ({ atividade: activity, registro: note })))}` },
          ],
        }),
      });
      if (!response.ok) return fallback;
      const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string") return fallback;
      const summary = content.replace(/^\s*(síntese|resumo)\s*:\s*/i, "").trim().replace(/^['"“”]+|['"“”]+$/g, "");
      if (!summary || summary.length > 180 || summary.includes(";") || /\b(?:como modelo de linguagem)\b/i.test(summary)) return fallback;
      return summary;
    } catch {
      return fallback;
    }
  }
}
