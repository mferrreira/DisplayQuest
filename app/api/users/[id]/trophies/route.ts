import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"

const { gamification: gamificationModule } = getBackendComposition()

/**
 * PATCH /api/users/[id]/trophies — plan-v8 V8-6 (DEC-217/218). Equipar ou desequipar um troféu
 * conquistado: `{ badgeId, action: "equip" | "unequip" }`.
 *
 * A rota é fina (D4, DEC-115..123): autentica, monta o ator, valida o `id` da PESSOA e mapeia o
 * resto com `domainErrorResponse`. O que decide fica no use case:
 *
 *   - a autoridade é `requireActorSelf` (DEC-218: "a pessoa equipa") — nenhuma permissão de gestão
 *     empresta esse direito e o ator de sistema não passa;
 *   - o teto de slot é a escada lida do XP da temporada (DEC-217), não um número vindo do cliente;
 *   - `action` e `badgeId` são validados no use case DEPOIS do gate — o mesmo precedente medido em
 *     `UpdateBadgeUseCase` (B6-2a): quem não é a pessoa não recebe 400 de entrada inválida.
 *
 * O `id` da pessoa é a única validação que a rota faz antes do gate porque é sobre ele que "self"
 * decide: a rota não tem como saber se o ator é a pessoa sem lê-lo. Nada sobre o troféu (se existe,
 * se está equipado, quantos há) é lido antes do gate rodar.
 *
 * O GET da mesma rota (V8-7, DEC-220) é a leitura da prateleira: as conquistas com nome, descrição e
 * efeito do catálogo, mais o estado de equip. É leitura aberta (a mesma decisão do dono para
 * `GET /api/user-badges`: ver o perfil do outro inclui ver os troféus dele) e por isso não divide o
 * gate do PATCH — quem olha não é quem move.
 *
 * A rota ficou sem chamador de tela na V8-6 (o comportamento do equipar é que era a onda, congelado em
 * `trophy-equip-routes.test.ts`); a tela que equipa chegou na V8-7 com o cliente `GamificationAPI`.
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

    const trophies = await gamificationModule.listUserTrophies({ userId })
    return NextResponse.json({ trophies })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar os troféus do usuário", exposeMessage: true })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const actor = userActor(auth.actor.id, auth.actor.roles)

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const body = await request.json()

    const outcome = await gamificationModule.changeTrophyEquip({
      actor,
      userId: id,
      badgeId: body?.badgeId,
      action: body?.action,
    })

    return NextResponse.json({ outcome })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao atualizar os troféus do usuário", exposeMessage: true })
  }
}
