import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { userActor } from "@/backend/domain"
import { requireApiActor } from "@/lib/auth/api-guard"
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

    // B6-7 (D4): o gate MANAGE_USERS ("Acesso negado", default do ensurePermission legado)
    // desceu para o ListGlobalProgressUseCase. Sem corpo nesta rota, entao nao ha par
    // 403-vs-400 de parse a preservar — a decisao inteira e do use case.
    const actor = userActor(auth.actor.id, auth.actor.roles)

    const data = await taskManagementModule.globalProgress({ actor })

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
