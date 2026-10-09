import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { getBackendComposition } from "@/backend/composition/root"
import { requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados. EVOLUTION (documentada): "Evento nao encontrado"
// antes caia no 500 (PATCH mapeava apenas 'permissao' -> 403); agora NotFoundError -> 404,
// ForbiddenError -> 403, ValidationError -> 400. O heuristic legado 'permissao'->403 segue
// como fallback para erros nao-tipados.
const { labOperations: labOperationsModule } = getBackendComposition()

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id } = await params
    const eventId = Number(id)

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return NextResponse.json({ error: "ID de evento inválido" }, { status: 400 })
    }

    const body = await request.json()
    const { date, note } = body

    if (date === undefined && note === undefined) {
      return NextResponse.json(
        { error: "Informe ao menos um campo para atualizar (date ou note)" },
        { status: 400 },
      )
    }
    if (date !== undefined && isNaN(new Date(date).getTime())) {
      return NextResponse.json({ error: "Data do evento inválida" }, { status: 400 })
    }
    if (note !== undefined && (typeof note !== "string" || note.trim().length === 0)) {
      return NextResponse.json({ error: "Nota do evento é obrigatória" }, { status: 400 })
    }

    const event = await labOperationsModule.updateLabEvent({
      eventId,
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
      date: date !== undefined ? new Date(date) : undefined,
      note: note !== undefined ? note.trim() : undefined,
    })

    return NextResponse.json({ event: event.toJSON() })
  } catch (error: any) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao atualizar evento:", error)
    const status = String(error?.message || "").includes("permissão") ? 403 : 500
    return NextResponse.json({ error: error.message || "Erro ao atualizar evento" }, { status })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id } = await params
    const eventId = Number(id)

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return NextResponse.json({ error: "ID de evento inválido" }, { status: 400 })
    }

    await labOperationsModule.deleteLabEvent({
      eventId,
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao remover evento", exposeMessage: true })
  }
}
