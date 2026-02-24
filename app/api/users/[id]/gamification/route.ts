import { NextResponse } from "next/server"
import { ensureSelfOrPermission, requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { gamification: gamificationModule } = getBackendComposition()
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const userId = Number(params.id)
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const accessError = ensureSelfOrPermission(auth.actor, userId, "MANAGE_USERS")
    if (accessError) return accessError

    const progression = await gamificationModule.getUserProgression(userId)
    return NextResponse.json({ progression }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao buscar progressão"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
