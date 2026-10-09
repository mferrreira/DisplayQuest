// @vitest-environment node
/**
 * B10 · D10 (DEC-125) — o corpo 500 unico das rotas.
 *
 * Os corpos medidos das rotas sao contrato (testes de rota pinam `{ error: "…" }`), entao o
 * mapper precisa reproduzir as TRES formas medidas e continuar devolvendo o mapeamento do
 * dominio quando o erro e de dominio. Cada forma abaixo foi extraida de rotas reais antes da
 * migracao (ver scripts/codemod-route-error.mjs).
 */
import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "@/backend/domain";
import { routeErrorResponse } from "@/lib/api/route-error-response";

async function bodyOf(response: Response) {
  return await response.json();
}

describe("routeErrorResponse (D10)", () => {
  it("erro de dominio continua mapeado por domainErrorResponse (400/404/409…)", async () => {
    for (const [error, status] of [
      [new ValidationError("x"), 400],
      [new NotFoundError("x"), 404],
      [new ConflictError("x"), 409],
    ] as const) {
      const response = routeErrorResponse(error, { fallback: "fallback qualquer" });
      expect(response.status).toBe(status);
      expect(await bodyOf(response)).toMatchObject({ code: expect.any(String) });
    }
  });

  it("forma A: corpo fixo (a mais limpa medida, default)", async () => {
    const response = routeErrorResponse(new Error("detalhe interno"));
    expect(response.status).toBe(500);
    expect(await bodyOf(response)).toEqual({ error: "Erro interno do servidor" });

    const named = routeErrorResponse(new Error("detalhe interno"), { fallback: "Erro ao buscar badge" });
    expect(await bodyOf(named)).toEqual({ error: "Erro ao buscar badge" });
  });

  it("forma B: exposeMessage — mensagem do erro vence, fallback quando vazia/nao-Error", async () => {
    const withMessage = routeErrorResponse(new Error("boom"), { fallback: "Erro ao resolver issue", exposeMessage: true });
    expect(await bodyOf(withMessage)).toEqual({ error: "boom" });

    const empty = routeErrorResponse(new Error(""), { fallback: "Erro ao resolver issue", exposeMessage: true });
    expect(await bodyOf(empty)).toEqual({ error: "Erro ao resolver issue" });

    const notError = routeErrorResponse("texto", { fallback: "Erro ao resolver issue", exposeMessage: true });
    expect(await bodyOf(notError)).toEqual({ error: "Erro ao resolver issue" });
  });

  it("forma C: details — mensagem do erro na chave details; nao-Error NAO ganha a chave (parity com error?.message)", async () => {
    const withDetails = routeErrorResponse(new Error("boom"), { fallback: "Erro ao buscar recompensa", details: true });
    expect(await bodyOf(withDetails)).toEqual({ error: "Erro ao buscar recompensa", details: "boom" });

    const notError = routeErrorResponse("texto", { fallback: "Erro ao buscar recompensa", details: true });
    expect(await bodyOf(notError)).toEqual({ error: "Erro ao buscar recompensa" });
  });
});
