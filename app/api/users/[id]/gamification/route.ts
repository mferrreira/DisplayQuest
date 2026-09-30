import { NextResponse } from "next/server"
import { ensureSelfOrPermission, requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

// OND6-B4 (R4): "Usuário não encontrado" antes caía no 500; agora NotFoundError -> 404
// (mensagem pinada pelo contract OND6-B3). Nao-DomainError mantem o shape legado.

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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    const message = error instanceof Error ? error.message : "Erro ao buscar progressão"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
