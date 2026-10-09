import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { getBackendComposition } from "@/backend/composition/root"
import { requireApiActor } from "@/lib/auth/api-guard"
// OND8-B4 (R4): DomainErrors mapeados. EVOLUTION: "Aviso nao encontrado" e bloqueios de
// acesso (mensagens 8L9 verbatim) antes caíam no 500; agora 404/403.
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
    return routeErrorResponse(error, { fallback: "Erro ao remover aviso", exposeMessage: true })
  }
}
