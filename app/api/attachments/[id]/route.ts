import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

// OND7-B4 (R4): DomainErrors ("Acesso negado" 403 / "Anexo não encontrado" 404) mapeados
// por domainErrorResponse — mesmos status do mapeamento por mensagem anterior.
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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao remover anexo:", error)
    const message = error instanceof Error ? error.message : "Erro ao remover anexo"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
