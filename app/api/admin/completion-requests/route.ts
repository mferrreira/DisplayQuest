import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * S01 (plan-v12, R3, DEC-238) — leitura da fila global de solicitações de conclusão para a
 * aba "Conclusões" do painel. A rota autentica, monta o ator e entrega o `now` do servidor;
 * o gate (`DASHBOARD_ADMIN` = aprovadores globais), a ordem e o prêmio previsto são do use
 * case. Leitura pura: nenhum estado muda aqui; aprovar é o POST da rota existente
 * `POST /api/projects/[id]/activities/[activityId]/approve-completion`.
 */
export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const requests = await projectManagementModule.listCompletionRequestsForActor({
      actor: userActor(auth.actor.id, auth.actor.roles),
      now: new Date(),
    })

    return NextResponse.json({ requests }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar as conclusões solicitadas" })
  }
}
