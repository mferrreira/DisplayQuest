import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao remover aviso:", error)
    return NextResponse.json({ error: error.message || "Erro ao remover aviso" }, { status: 500 })
  }
}
