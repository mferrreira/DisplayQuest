import { NextRequest, NextResponse } from "next/server"

import { getBackendComposition } from "@/backend/composition/root"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { civilYearOfInstant } from "@/backend/domain/time"

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
 * plan-v20 S02 (DEC-252, DEC-255) acrescenta `?year=AAAA` — o quadro congelado de uma temporada
 * (mesmos contratos de CA4/CA8 do mês) — e o `seasonYear` + `closedSeasons` na resposta sem
 * parâmetro, para a aba Temporada. A tela não deduz anos: calcular ano no navegador desloca a
 * virada do ano no fuso do laboratório (DEC-132).
 *
 * Leitura do autenticado, como o quadro de hoje: nenhum gate novo de leitura (DEC-136, R12).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const year = request.nextUrl.searchParams.get("year")
    if (year !== null) {
      // plan-v20 S02 (DEC-252, DEC-255): o quadro congelado de uma temporada, na MESMA rota e
      // nos mesmos contratos de CA4/CA8 do mês. Ano em curso pedido responde `live: true`; ano
      // malformado é 400 nomeando o campo, decidido no use case.
      return NextResponse.json(await gamification.readSeasonHistory(year, new Date()))
    }

    const month = request.nextUrl.searchParams.get("month")
    if (month !== null) {
      return NextResponse.json(await gamification.readBoardMonthHistory(month, new Date()))
    }

    const closedMonths = await gamification.listClosedBoardMonths()
    // plan-v20 S02: o seletor da aba Temporada também não deduz anos — o servidor declara o ano
    // em curso (mesma regra da DEC-132: calcular ano no navegador desloca a virada) e lista as
    // temporadas que já fecharam.
    const now = new Date()
    const closedSeasons = await gamification.listClosedSeasons()
    const seasonYear = civilYearOfInstant(now)
    return NextResponse.json({
      ...gamification.readBoardMonth(now),
      live: true,
      closedMonths,
      seasonYear,
      closedSeasons,
    })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao ler o mês do quadro" })
  }
}
