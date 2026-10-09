import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
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
    return routeErrorResponse(error, { fallback: "Erro ao remover anexo", exposeMessage: true })
  }
}
