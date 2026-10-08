import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND7-B4 (R4): DomainErrors mapeados por domainErrorResponse; 500 preservado p/ desconhecidos.
// B6-3 (D4): o gate MANAGE_USERS com a mensagem propria desceu para GetProjectStatsUseCase.
const { reporting: reportingModule } = getBackendComposition()
export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)

    const stats = await reportingModule.getProjectStats(actor)
    return NextResponse.json({ stats }, { status: 200 })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro na API de estatísticas dos projetos:", error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
