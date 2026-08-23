import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { reporting: reportingModule } = getBackendComposition()

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const attachmentId = Number(params.id)
    if (!/^\d+$/.test(params.id) || attachmentId <= 0) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    await reportingModule.deleteReportAttachment({
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
      attachmentId,
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Erro ao remover anexo:", error)
    const message = error instanceof Error ? error.message : "Erro ao remover anexo"
    const status = message.includes("Acesso negado") ? 403 : message.includes("não encontrado") ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
