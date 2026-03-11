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
    const noticeId = Number(id)

    if (!Number.isInteger(noticeId) || noticeId <= 0) {
      return NextResponse.json({ error: "ID de aviso invalido" }, { status: 400 })
    }

    await labOperationsModule.deleteLabNotice({
      noticeId,
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Erro ao remover aviso:", error)
    return NextResponse.json({ error: error.message || "Erro ao remover aviso" }, { status: 500 })
  }
}
