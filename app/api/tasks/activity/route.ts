import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { getBackendComposition } from "@/backend/composition/root"
import { requireApiActor } from "@/lib/auth/api-guard"
import { startOfCivilDayInstant } from "@/backend/domain"

const { taskManagement: taskManagementModule } = getBackendComposition()

/**
 * Feed "Atividade recente" da Home. Leitura aberta ao autenticado (o titulo de tarefa ja e
 * visivel ao autenticado no modelo de leitura aberta) — sem gate de projeto de proposito.
 *
 * V6-11k: o feed mostra SÓ o dia corrente. O corte é o mesmo `startOfCivilDayInstant` que a
 * limpeza periódica usa (cron) — duas contas de "hoje" divergiriam na virada do dia.
 *
 * Recorte (dono, 2026-10-21): com `?projectId=` o feed mostra só aquele projeto; sem ele,
 * só os projetos de que a pessoa e membro (tarefas globais seguem visiveis).
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const parsed = parseInt(searchParams.get("limit") ?? "15", 10)
    const limit = Number.isFinite(parsed) ? Math.min(50, Math.max(1, parsed)) : 15
    const rawProjectId = searchParams.get("projectId")
    const projectId =
      rawProjectId && /^\d+$/.test(rawProjectId) && Number(rawProjectId) > 0
        ? Number(rawProjectId)
        : undefined

    const items = await taskManagementModule.listActivity(
      limit,
      startOfCivilDayInstant(new Date()),
      { actorId: auth.actor.id, projectId },
    )
    return NextResponse.json({ items })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar atividade" })
  }
}
