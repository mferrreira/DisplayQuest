import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { createReportingModule } from "@/backend/modules/reporting"

const reportingModule = createReportingModule()

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
    console.error("Erro na API de estatísticas dos projetos:", error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
