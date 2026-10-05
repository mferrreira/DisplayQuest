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
    const points = Number(body?.points)

    // A ordem é do V4-6 (DEC-60) e não é cosmética: para saber se o número pode ser negativo a
    // rota precisa conhecer a AÇÃO antes. Antes, `points < 0` vinha primeiro, e um corpo
    // `{action:"bogus", points:-5}` denunciava o número em vez da ação inválida.
    if (!["add", "remove", "set"].includes(action)) {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
    }

    if (!Number.isFinite(points)) {
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
