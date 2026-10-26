import { NextRequest, NextResponse } from "next/server"

import { getBackendComposition } from "@/backend/composition/root"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"

const { gamification } = getBackendComposition()

/**
 * GET /api/board — plan-v9 S01 (R4) e S03 (R12, CA4, CA8, §7).
 *
 * Sem `?month`: declara o mes em curso e lista os meses que ja fecharam. A tela nao deduz meses —
 * sem essa lista o seletor ofereceria mes sem fechamento e a resposta vazia pareceria bug.
 *
 * Com `?month=AAAA-MM`: o quadro congelado daquele mes (CA4), ou quadro vazio com aviso nomeando
 * o mes pedido (CA8). A rota nunca cai no quadro do mes corrente quando o mes nao existe. Mes com
 * forma invalida e 400 nomeando o campo, decidido no use case (`ValidationError`).
 *
 * Leitura do autenticado, como o quadro de hoje: nenhum gate novo de leitura (DEC-136, R12).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const month = request.nextUrl.searchParams.get("month")
    if (month !== null) {
      return NextResponse.json(await gamification.readBoardMonthHistory(month, new Date()))
    }

    const closedMonths = await gamification.listClosedBoardMonths()
    return NextResponse.json({ ...gamification.readBoardMonth(new Date()), closedMonths })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao ler o mês do quadro" })
  }
}
