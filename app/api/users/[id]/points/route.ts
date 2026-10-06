import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_USERS")
    if (deny) return deny

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const body = await request.json()
    const action = body?.action
    const rawPoints = body?.points

    // A ordem é do V4-6 (DEC-60) e não é cosmética: para saber se o número pode ser negativo a
    // rota precisa conhecer a AÇÃO antes. Antes, `points < 0` vinha primeiro, e um corpo
    // `{action:"bogus", points:-5}` denunciava o número em vez da ação inválida.
    if (!["add", "remove", "set"].includes(action)) {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
    }

    // DEC-84 (dono, 2026-10-06, fechando ASK-V4-06): o número é lido do VALOR BRUTO, não de
    // `Number(body.points)`. Motivo medido no V4-6: JSON não tem `Infinity` — `JSON.stringify(Infinity)`
    // devolve `null` — e `Number(null)` é 0. Um corpo `{action:"set", points:null}` zerava os pontos
    // de um usuário em vez de ser recusado. `Number("")` também é 0, e `Number(true)` é 1: a checagem
    // é de TIPO antes de ser de valor. String numérica continua aceita (é o que alguns clientes mandam).
    const points = typeof rawPoints === "string" ? Number(rawPoints.trim()) : Number(rawPoints);
    const isNumeric =
      (typeof rawPoints === "number" || (typeof rawPoints === "string" && rawPoints.trim() !== "")) &&
      Number.isFinite(points);
    if (!isNumeric) {
      return NextResponse.json({ error: "Pontos devem ser um número não negativo" }, { status: 400 })
    }

    // DEC-60 (dono, 2026-10-05): `set` passa a aceitar negativo. Motivo medido: a premiação
    // produz total negativo (DEC-39, penalidade sem piso — Coordenador em -20 e Gerente em
    // -31030 na instância real), mas nenhum caminho de administração conseguia escrevê-lo de
    // volta. `add` (chão em 0) e `remove` (exige suficiência) continuam não-negativos — o dono
    // escolheu expressamente a alternativa estreita.
    if (points < 0 && action !== "set") {
      return NextResponse.json({ error: "Pontos devem ser um número não negativo" }, { status: 400 })
    }

    const user = await userManagementModule.updateUserPoints({
      userId: id,
      action,
      points,
    })

    return NextResponse.json({ user })
  } catch (error: any) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao atualizar pontos do usuário:", error)
    return NextResponse.json({ error: error.message || "Erro ao atualizar pontos do usuário" }, { status: 500 })
  }
}
