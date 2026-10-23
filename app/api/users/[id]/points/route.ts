import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { allowsNegativeAdjustment, parseBalanceTrack, trackLabelSentence, userActor } from "@/backend/domain"
import type { TrackAdjustmentAction } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
// B6-4 (D4): o gate MANAGE_USERS mora no caso de uso; o assert roda ANTES da
// validacao de id/acao/numero (ordem medida). As validacoes DEC-60/DEC-84 sao de ENTRADA com
// mensagens proprias e continuam aqui, na ordem que o V4-6 congelou (acao antes do numero).
//
// plan-v8 V8-5 (ASK-V8-24, respondida pelo dono em 2026-10-22): o caminho virou o ajuste manual
// das DUAS trilhas de saldo, separadas. O corpo traz `track` ("points" | "coins"; ausente e
// pontos) e `amount` no lugar de `points` — o numero nao tem mais nome de trilha que nao e a dele.
// A trilha escolhe a frase de recusa (`trackLabel` no dominio), e a unica assimetria de numero
// entre as duas (`set` aceitando negativo so na trilha pontos, DEC-60) vem da regra pura
// `allowsNegativeAdjustment`, nao de um if solto aqui.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const actor = userActor(auth.actor.id, auth.actor.roles)
    userManagementModule.assertCanManageUsers({ actor })

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const body = await request.json()
    const action = body?.action
    const rawPoints = body?.amount

    // A ordem é do V4-6 (DEC-60) e não é cosmética: para saber se o número pode ser negativo a
    // rota precisa conhecer a AÇÃO antes. Antes, `points < 0` vinha primeiro, e um corpo
    // `{action:"bogus", points:-5}` denunciava o número em vez da ação inválida.
    if (!["add", "remove", "set"].includes(action)) {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
    }

    // V8-5: a trilha vem depois da ação e antes do número, pela mesma razão — a frase e a regra do
    // número dependem dela. O vocabulário é o fechado do domínio (POINTS | COINS, ausente é o
    // credit histórico de pontos); valor desconhecido é recusado com frase própria da rota.
    const balanceTrack = parseBalanceTrack(body?.track)
    if (!balanceTrack) {
      return NextResponse.json({ error: "Trilha inválida: use POINTS ou COINS" }, { status: 400 })
    }

    // DEC-84 (dono, 2026-10-06, fechando ASK-V4-06): o número é lido do VALOR BRUTO, não de
    // `Number(body.amount)`. Motivo medido no V4-6: JSON não tem `Infinity` — `JSON.stringify(Infinity)`
    // devolve `null` — e `Number(null)` é 0. Um corpo `{action:"set", amount:null}` zerava os pontos
    // de um usuário em vez de ser recusado. `Number("")` também é 0, e `Number(true)` é 1: a checagem
    // é de TIPO antes de ser de valor. String numérica continua aceita (é o que alguns clientes mandam).
    const points = typeof rawPoints === "string" ? Number(rawPoints.trim()) : Number(rawPoints);
    const isNumeric =
      (typeof rawPoints === "number" || (typeof rawPoints === "string" && rawPoints.trim() !== "")) &&
      Number.isFinite(points);
    const label = trackLabelSentence(balanceTrack);
    if (!isNumeric) {
      // Mensagem preservada do V4-6 (DEC-84) para a trilha pontos, agora nomeando a trilha que
      // cobra: é o texto que os testes congelam e o que a tela mostra.
      return NextResponse.json({ error: `${label} devem ser um número não negativo` }, { status: 400 })
    }

    // DEC-60 (dono, 2026-10-05): `set` passa a aceitar negativo na trilha pontos. Motivo medido: a
    // premiação produz total negativo (DEC-39, penalidade sem piso — Coordenador em -20 e Gerente em
    // -31030 na instância real), mas nenhum caminho de administração conseguia escrevê-lo de volta.
    // `add` (chão em 0) e `remove` (exige suficiência) continuam não-negativos. Na moeda a regra é
    // não-negativa nas três ações (DEC-222): nenhuma fonte produz moeda negativa — o prêmio tem piso
    // 0 (DEC-74) — e moeda negativa seria debito de loja. A régua é `allowsNegativeAdjustment`.
    if (points < 0 && !allowsNegativeAdjustment(balanceTrack, action as TrackAdjustmentAction)) {
      return NextResponse.json({ error: `${label} devem ser um número não negativo` }, { status: 400 })
    }

    const user = await userManagementModule.adjustUserBalance({
      actor,
      userId: id,
      track: balanceTrack,
      action: action as TrackAdjustmentAction,
      amount: points,
    })

    return NextResponse.json({ user })
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao atualizar o saldo do usuário", exposeMessage: true })
  }
}
