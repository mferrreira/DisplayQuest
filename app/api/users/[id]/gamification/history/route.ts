import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"

const { gamification: gamificationModule } = getBackendComposition()

/**
 * GET /api/users/[id]/gamification/history — plan-v8 V8-7 (DEC-220). O histórico DA PESSOA: os meses
 * fechados (`month_history`), as temporadas fechadas (`season_history`) e os anos em que a pessoa
 * fechou na posição do campeão.
 *
 * A rota é fina: autentica, valida o `id` (400 "Usuário inválido", a mesma grafia da rota vizinha
 * `GET /api/users/[id]/gamification`) e devolve o que o use case produziu.
 *
 * Não há gate de self-ou-gestão aqui, e a razão é dita: o histórico é a memória do quadro, e o quadro
 * é leitura do autenticado (o perfil do outro já mostra os troféus dele desde 2026-10-07 — "ver os
 * perfis dos outros inclui ver as insígnias"). O que é self-ou-gestão nesta casa é a progressão viva
 * (rota ao lado) e o que é restrito de verdade é o CPF (DEC-138).
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const userId = Number(params.id)
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const history = await gamificationModule.readUserCycleHistory({ userId })
    return NextResponse.json({ history })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar o histórico do usuário", exposeMessage: true })
  }
}
