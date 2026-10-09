/**
 * routeErrorResponse — o fallback 500 único das rotas HTTP (B10 · D10, DEC-125).
 *
 * O D10 mediu 127 blocos `catch` com o MESMA decisão em 76 rotas: mapear erro de domínio com
 * `domainErrorResponse` e, se não for de domínio, devolver 500 com um corpo. Os corpos variam
 * (mensagem fixa por rota, `details` com a mensagem do erro, ou a mensagem do erro como corpo)
 * e VARIAM COMO CONTRATO — testes pinam `{ error: "Erro interno do servidor" }` em algumas
 * rotas. Por isso as três formas medidas viram opções nomeadas daqui, e cada rota passa a
 * declarar a sua em uma linha em vez de reimplementar a decisão.
 *
 * O wrapper completo (`withRouteHandler`) foi medido e descartado: as assinaturas de contexto
 * do Next (`{ params: Promise<…> }`) e a indentação de 127 blocos fariam a reescrita trocar
 * forma sem trocar decisão. O que o D10 pedia — um lugar único para a decisão — é esta função.
 */
import { NextResponse } from "next/server"
import { domainErrorResponse } from "./domain-error-response"

export interface RouteErrorOptions {
  /** Mensagem do corpo 500. Default `"Erro interno do servidor"` (a forma mais limpa medida). */
  fallback?: string
  /** Corpo `{ error, details }` — `details` é a mensagem do erro, `undefined` para não-Error
   *  (preserva o `error?.message` legado: a chave simplesmente não aparece no JSON). */
  details?: boolean
  /** Corpo `{ error: mensagemDoErro || fallback }` — a forma que expunha `error.message`. */
  exposeMessage?: boolean
}

export function routeErrorResponse(error: unknown, options: RouteErrorOptions = {}): NextResponse {
  const mapped = domainErrorResponse(error)
  if (mapped) return mapped

  console.error("Erro na rota:", error)

  const fallback = options.fallback ?? "Erro interno do servidor"

  if (options.exposeMessage) {
    const message = error instanceof Error ? error.message : ""
    return NextResponse.json({ error: message || fallback }, { status: 500 })
  }

  if (options.details) {
    const details = error instanceof Error ? error.message : undefined
    return NextResponse.json({ error: fallback, details }, { status: 500 })
  }

  return NextResponse.json({ error: fallback }, { status: 500 })
}
