import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND7-B4 (R4): DomainErrors mapeados por domainErrorResponse; 500 preservado p/ desconhecidos.
const { reporting: reportingModule } = getBackendComposition()
export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const accessError = ensurePermission(
      auth.actor,
      "MANAGE_USERS",
      "Apenas coordenadores e gerentes podem acessar estatísticas gerais",
    )
    if (accessError) return accessError

    const stats = await reportingModule.getProjectStats()
    return NextResponse.json({ stats }, { status: 200 })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro na API de estatísticas dos projetos:", error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
