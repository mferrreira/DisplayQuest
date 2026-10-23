import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"

const { gamification: gamificationModule } = getBackendComposition()

/**
 * GET /api/gamification/season-book — plan-v8 V8-7 (DEC-220). O livro-caixa da última temporada
 * fechada (MODELO §4): posição e degrau fotografados, lidos das linhas que o fechamento escreveu.
 *
 * `{ year: null, standings: [] }` quando nenhuma temporada fechou ainda — o ano em curso não tem
 * livro, do mesmo modo que o mês em curso não tem snapshot (DEC-212/213). A tela diz isso em vez de
 * mostrar um quadro vazio como se fosse o ano corrente.
 *
 * Leitura aberta ao autenticado, como o quadro do mês.
 */
export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const ledger = await gamificationModule.readSeasonLedger()
    return NextResponse.json({ ledger })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar o livro-caixa da temporada" })
  }
}
