import { NextRequest, NextResponse } from "next/server"

import { getBackendComposition } from "@/backend/composition/root"
import { userActor } from "@/backend/domain/identity"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"

const { gamification } = getBackendComposition()

/**
 * POST /api/board/season-close — plan-v20 S01 (DEC-254; o desenho medido de CA9 do fechamento
 * de mês, espelhado).
 *
 * A gestão dispara o fechamento da temporada quando a rotina das 00:00 de 1 de janeiro não
 * rodou. A autoridade é `MANAGE_USERS` e decide dentro do `CloseSeasonUseCase` (D4): a rota
 * autentica, monta o ator e chama. Sem corpo para parsear, o gate acontece antes de qualquer
 * leitura de gente ou escrita no banco — o teste de rota mede que nenhum 403 chega perto de
 * escrever.
 *
 * A rota nunca constrói ator de sistema: o ator de sistema `SEASON_CLOSE` pertence ao cron, e
 * o guarda `tests/unit/domain/identity/system-actor.test.ts` falha o build se alguma rota em
 * `app/api/**` escrever a chamada (DEC-54).
 */
export async function POST(_request: NextRequest) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const result = await gamification.closeSeason({ actor, now: new Date() })

    return NextResponse.json(result)
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao fechar a temporada do quadro" })
  }
}
