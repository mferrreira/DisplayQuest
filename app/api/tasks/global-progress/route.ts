import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

const { taskManagement: taskManagementModule } = getBackendComposition()

/**
 * OND4-B4 (R4): the global-progress aggregation moved to ListGlobalProgressUseCase — this
 * route used to read Prisma directly (rg06 debt, allow-list entry removed in this batch).
 * Response shape frozen: { globalTasks: [...] } with the roster counts/rates.
 */
export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const deny = ensurePermission(auth.actor, "MANAGE_USERS", "Acesso negado")
    if (deny) return deny

    const data = await taskManagementModule.globalProgress()

    return NextResponse.json({ globalTasks: data }, { status: 200 })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar progresso de tarefas globais:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno do servidor" },
      { status: 500 },
    )
  }
}
