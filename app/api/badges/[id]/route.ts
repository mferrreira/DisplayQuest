import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

// OND6-B4 (R4): DomainErrors mapeados por domainErrorResponse. EVOLUTION: "Badge não
// encontrado" no PUT/DELETE antes caía no 500 com error.message; agora NotFoundError ->
// 404 (mensagem pinada pelo contract OND6-B3). O GET mantém o 404 manual (getBadgeById
// devolve null, nao lanca).
//
// B6-2a (D4, DEC-53): os gates de MANAGE_REWARDS desceram para Update/DeleteBadgeUseCase, e a
// validação do id foi junto — ela vinha DEPOIS do gate, e ficar na rota a executaria antes da
// chamada, devolvendo 400 a quem tem 403. No use case a ordem se mantém: primeiro a permissão,
// depois o id. GET continua sendo leitura pública com o 400/404 manuais, sem ator.

const { gamification: gamificationModule } = getBackendComposition()
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Badge inválido" }, { status: 400 })
    }

    const badge = await gamificationModule.getBadgeById(id)
    if (!badge) {
      return NextResponse.json({ error: "Badge não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ badge })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar badge:", error)
    return NextResponse.json({ error: "Erro ao buscar badge" }, { status: 500 })
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const body = await request.json()
    const badge = await gamificationModule.updateBadge({
      id: Number(params.id),
      data: body,
      actorRoles: auth.actor.roles,
    })
    return NextResponse.json({ badge })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao atualizar badge:", error)
    const message = error instanceof Error ? error.message : undefined
    return NextResponse.json({ error: message || "Erro ao atualizar badge" }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    await gamificationModule.deleteBadge({
      id: Number(params.id),
      actorRoles: auth.actor.roles,
    })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao excluir badge:", error)
    const message = error instanceof Error ? error.message : undefined
    return NextResponse.json({ error: message || "Erro ao excluir badge" }, { status: 500 })
  }
}
