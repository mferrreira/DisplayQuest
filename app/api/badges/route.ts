import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

// OND6-B4 (R4): DomainErrors mapeados por domainErrorResponse. EVOLUTION: validacoes de
// createBadge antes caíam no 500 com error.message; agora ValidationError -> 400
// {error,code,details} (mensagens pinadas pelo contract OND6-B3).
//
// B6-2a (D4, DEC-53): o gate de MANAGE_REWARDS desceu para o CreateBadgeUseCase. A rota
// decide, mapeia e pronto — `ensurePermission` saiu daqui. O 403 continua sendo
// "Sem permissão para criar badges", agora lançado pelo domínio (o corpo ganha code/details:
// superset do OND8-B4, status e mensagem intactos).
//
// GET segue sem auth: a lista de badges é leitura pública.

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

    const body = await request.json()
    const badge = await gamificationModule.createBadge({
      ...body,
      createdBy: auth.actor.id,
      actorRoles: auth.actor.roles,
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
