import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-7a (DEC-76/99/162) — solicitar a conclusão da atividade (fase 1 das duas fases):
 * OPEN → COMPLETION_REQUESTED. Não há corpo: o que a rota faz é autenticar, montar o ator e
 * entregar o `now` do servidor ao use case, que decide gate (403), status (409), trava de
 * tarefa pendente (400, DEC-99) e exigência de prova (400, DEC-162) — todas dentro do use
 * case, porque o consumidor da regra é ele (DEC-157/160).
 *
 * O prêmio não cai aqui: só na aprovação (DEC-76), que é o V5-7b.
 */

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; activityId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    const activityId = Number(params.activityId)
    if (![projectId, activityId].every((n) => Number.isInteger(n) && n > 0)) {
      return NextResponse.json({ error: "Projeto ou atividade inválido" }, { status: 400 })
    }

    const activity = await projectManagementModule.requestActivityCompletion({
      projectId,
      activityId,
      actorId: auth.actor.id,
      now: new Date(),
    })
    return NextResponse.json({ activity }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
