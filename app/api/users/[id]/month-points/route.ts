import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import {
  MONTH_ADJUST_DENIED_MESSAGE,
  MONTH_ADJUST_NON_NEGATIVE_MESSAGE,
  MONTH_POINTS_ACTIONS,
} from "@/backend/domain/gamification"
import { getBackendComposition } from "@/backend/composition/root"

const { userManagement: userManagementModule, gamification } = getBackendComposition()

/**
 * PATCH /api/users/[id]/month-points — plan-v9 S05 (MODELO §6, CA12; ADR-006/DEC-228).
 *
 * O ajuste do placar do MÊS corrente, com a MESMA régua do ajuste do saldo (DEC-60): `set`
 * escreve valor absoluto e aceita negativo, `add` tem chão em 0, `remove` exige suficiência —
 * a aritmética e as recusas moram no use case (`AdjustMonthPointsUseCase`), a auditoria
 * de/para é escrita por ele. Um mês fechado não tem coluna a escrever: o ajuste toca só
 * `users.currentMonthPoints`.
 *
 * B6-7 (ordem medida do par de rotas de usuário): o gate corre ANTES de qualquer leitura do
 * request — quem não pode ajustar leva o 403 mesmo com corpo inválido. `{ actor,
 * deniedMessage: MONTH_ADJUST_DENIED_MESSAGE }` mantém o use case e a rota na MESMA frase
 * (MONTH_CLOSE_DENIED_MESSAGE já era assim). O gate de verdade recheca no use case.
 *
 * As validações de ENTRADA são as do V4-6, agora com a ação de mês: ação antes do número, e o
 * número é lido do VALOR BRUTO (DEC-84) — `JSON.stringify(Infinity)` é `null` e `Number(null)`
 * é 0; `{action:"set", points:null}` recusa em vez de zerar o placar de alguém.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const actor = userActor(auth.actor.id, auth.actor.roles)
    userManagementModule.assertCanManageUsers({ actor, deniedMessage: MONTH_ADJUST_DENIED_MESSAGE })

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const body = await request.json()
    const action = body?.action
    const rawPoints = body?.points

    // A ordem DEC-60 (medida na rota do saldo): a ação decide o que o número pode ser —
    // `set` aceita negativo, `add`/`remove` não. Inverter a ordem seria aceitar o que a regra
    // recusa e recusar o que a regra aceita. O vocabulário é o do domínio (MONTH_POINTS_ACTIONS),
    // e as duas mensagens são as constantes dele — sem cópia local (revisão S05).
    if (!MONTH_POINTS_ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
    }

    const points = typeof rawPoints === "string" ? Number(rawPoints.trim()) : Number(rawPoints)
    const isNumeric =
      (typeof rawPoints === "number" || (typeof rawPoints === "string" && rawPoints.trim() !== "")) &&
      Number.isFinite(points)
    if (!isNumeric) {
      return NextResponse.json({ error: MONTH_ADJUST_NON_NEGATIVE_MESSAGE }, { status: 400 })
    }

    // DEC-60/DEC-228: `set` aceita negativo (a premiação produz placar negativo — DEC-39, a
    // penalidade de atraso sem piso alcança a trilha do mês); `add` e `remove` não.
    if (points < 0 && action !== "set") {
      return NextResponse.json({ error: MONTH_ADJUST_NON_NEGATIVE_MESSAGE }, { status: 400 })
    }

    const result = await gamification.adjustMonthPoints({
      actor,
      userId: id,
      action,
      points,
      now: new Date(),
    })

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao ajustar o placar do mês", exposeMessage: true })
  }
}
