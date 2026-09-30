import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

// OND6-B4 (R4): DomainErrors mapeados por domainErrorResponse. EVOLUTION: validacoes de
// createBadge antes caíam no 500 com error.message; agora ValidationError -> 400
// {error,code,details} (mensagens pinadas pelo contract OND6-B3).

const { gamification: gamificationModule } = getBackendComposition()
export async function GET() {
  try {
    const badges = await gamificationModule.listBadges()
    return NextResponse.json({ badges })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar badges:", error)
    return NextResponse.json({ error: "Erro ao buscar badges" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS", "Sem permissão para criar badges")
    if (deny) return deny

    const body = await request.json()
    const badge = await gamificationModule.createBadge({
      ...body,
      createdBy: auth.actor.id,
    })

    return NextResponse.json({ badge }, { status: 201 })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao criar badge:", error)
    const message = error instanceof Error ? error.message : undefined
    return NextResponse.json({ error: message || "Erro ao criar badge" }, { status: 500 })
  }
}
