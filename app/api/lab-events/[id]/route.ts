import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { requireApiActor } from "@/lib/auth/api-guard"

const { labOperations: labOperationsModule } = getBackendComposition()

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
    console.error("Erro ao remover evento:", error)
    return NextResponse.json({ error: error.message || "Erro ao remover evento" }, { status: 500 })
  }
}
