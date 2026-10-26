import { NextRequest, NextResponse } from "next/server"

import { getBackendComposition } from "@/backend/composition/root"
import { userActor } from "@/backend/domain/identity"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"

const { gamification } = getBackendComposition()

/**
 * POST /api/board/close — plan-v9 S02 (MODELO §7, CA9, R6).
 *
 * A gestão dispara o fechamento quando a rotina das 00:00 do dia 1 não rodou. A autoridade é
 * `MANAGE_USERS` e decide dentro do `CloseBoardMonthUseCase` (D4): a rota autentica, monta o ator
 * e chama. Sem corpo para parsear, o gate acontece antes de qualquer leitura de gente ou escrita
 * no banco (CA9) — o teste de rota mede que nenhum 403 chega perto de escrever.
 *
 * A rota nunca constrói ator de sistema: o ator de sistema `MONTH_CLOSE` pertence ao cron, e o
 * guarda `tests/unit/domain/identity/system-actor.test.ts` falha o build se alguma rota em
 * `app/api/**` escrever a chamada (DEC-54). Nem em comentário: o guarda lê texto.
 */
export async function POST(_request: NextRequest) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const result = await gamification.closeBoardMonth({ actor, now: new Date() })

    return NextResponse.json(result)
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao fechar o mês do quadro" })
  }
}
