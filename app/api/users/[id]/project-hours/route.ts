import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND7-B4 (R4): DomainErrors mapeados por domainErrorResponse (404/400); 500 preservado p/ desconhecidos.
// B6-4 (D4): self || MANAGE_USERS (mensagem default) desceu para GetUserProjectHoursUseCase;
// a validacao do id (400 "Usuario invalido") continua ANTES do gate, como na rota legado.
const { reporting: reportingModule } = getBackendComposition()
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const targetUserId = Number(params.id)
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get("weekStart") || undefined
    const weekEnd = searchParams.get("weekEnd") || undefined

    const hours = await reportingModule.getUserProjectHours({
      actor: userActor(auth.actor.id, auth.actor.roles),
      userId: targetUserId,
      weekStart,
      weekEnd,
    })

    return NextResponse.json({ hours }, { status: 200 })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro na API de horas dos projetos do usuário:", error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
