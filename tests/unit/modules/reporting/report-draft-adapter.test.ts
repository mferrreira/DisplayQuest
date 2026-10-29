// @vitest-environment node
/**
 * V5-9c (DEC-139/152) — adaptador OpenAI-compatible do rascunho, com o `fetch` dobrado.
 *
 * A suíte nunca toca a IA (DEC-152 mediu o servidor, o teste não depende dele): o
 * desenho é o do bucket (DEC-101) — porta injetável, cliente dobrável. Congelado:
 * forma do pedido (`/chat/completions`, model das envs, system + user), `Authorization`
 * só quando `AI_API_KEY` existe, default `http://localhost:8080/v1` com barra final
 * descartada, e as três falhas viram a MESMA família de frase "IA indisponível"
 * (conexão, HTTP de erro, resposta sem conteúdo) — a rota traduz para 502.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OpenAiReportDraftAdapter,
  reportDraftConfigFromEnv,
} from "@/backend/modules/reporting/infrastructure/adapters/openai-report-draft.adapter";

const CONFIG = { baseUrl: "http://100.112.10.76:8080/v1", apiKey: "chave-teste", model: "qwen-local" };

// `vi.fn` sem tipo tem `mock.calls` como tupla vazia (gotcha da casa): o mock do
// `fetch` é tipado na assinatura real para as asserções de URL/init compilarem.
function fetchMock(impl: (url: string, init: RequestInit) => Promise<Response>) {
  return vi.fn<(url: string, init: RequestInit) => Promise<Response>>(impl);
}

const OK = (body: string) => async () => new Response(body, { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("OpenAiReportDraftAdapter (V5-9c, DEC-152)", () => {
  it("monta o pedido OpenAI-compatible: URL, model e as duas mensagens", async () => {
    const spy = fetchMock(OK(JSON.stringify({ choices: [{ message: { content: "  rascunho  " } }] })));
    vi.stubGlobal("fetch", spy);

    const adapter = new OpenAiReportDraftAdapter(CONFIG);
    const draft = await adapter.generateDraft("prompt do teste");

    expect(draft).toBe("rascunho"); // trim — o que entra no editor é o que a IA devolve
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("http://100.112.10.76:8080/v1/chat/completions");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("qwen-local");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1]).toEqual({ role: "user", content: "prompt do teste" });
  });

  it("Authorization só sai quando AI_API_KEY existe — o servidor local não exige auth", async () => {
    const spy = fetchMock(OK(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));
    vi.stubGlobal("fetch", spy);

    await new OpenAiReportDraftAdapter({ ...CONFIG, apiKey: null }).generateDraft("p");
    const init = spy.mock.calls[0][1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();

    await new OpenAiReportDraftAdapter(CONFIG).generateDraft("p");
    const init2 = spy.mock.calls[1][1];
    expect((init2.headers as Record<string, string>).Authorization).toBe("Bearer chave-teste");
  });

  it("default medido do plano: AI_BASE_URL ausente é http://localhost:8080/v1, barra final descartada", () => {
    vi.stubEnv("AI_BASE_URL", undefined);
    vi.stubEnv("AI_MODEL", undefined);
    const config = reportDraftConfigFromEnv();
    expect(config.baseUrl).toBe("http://localhost:8080/v1");
    expect(config.model).toBe("local");

    vi.stubEnv("AI_BASE_URL", "http://ai.lab:8080/v1/");
    expect(reportDraftConfigFromEnv().baseUrl).toBe("http://ai.lab:8080/v1");
  });

  it("env VAZA do compose conta como ausente — o default não pode virar URL relativa", () => {
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_MODEL", "");
    const config = reportDraftConfigFromEnv();
    expect(config.baseUrl).toBe("http://localhost:8080/v1");
    expect(config.apiKey).toBeNull();
    expect(config.model).toBe("local");
  });

  it("conexão recusada vira 'IA indisponível' nomeando o endereço", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(new OpenAiReportDraftAdapter(CONFIG).generateDraft("p")).rejects.toThrow(
      "IA indisponível em http://100.112.10.76:8080/v1",
    );
  });

  it("HTTP de erro vira 'IA indisponível' com o status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));
    await expect(new OpenAiReportDraftAdapter(CONFIG).generateDraft("p")).rejects.toThrow(
      "IA indisponível: HTTP 503",
    );
  });

  it("resposta sem conteúdo vira 'IA indisponível' — texto vazio não entra no editor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "   " } }] }), { status: 200 }),
    ));
    await expect(new OpenAiReportDraftAdapter(CONFIG).generateDraft("p")).rejects.toThrow(
      "IA indisponível: resposta sem conteúdo",
    );
  });
});
