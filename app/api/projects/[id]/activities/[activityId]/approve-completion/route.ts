import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-7b (DEC-76/77/103/104) — aprovar a conclusão da atividade (fase 2 das duas fases):
 * COMPLETION_REQUESTED → DONE. Sem corpo: a rota autentica, monta o ator (com os papéis
 * GLOBAIS — o gate da aprovação é `GLOBAL_PROJECT_MANAGERS` e a auto-aprovação só COORDENADOR
 * precisa do papel para decidir) e entrega o `now` do servidor. Gate, status, prêmio,
 * distribuição e `projects.points` são do use case (DEC-157/160).
 *
 * A resposta carrega a economia: `award` (prêmio), `shares` (o que foi creditado por membro,
 * 0 quando já registrado ou o crédito falhou) e `projectsPoints` (saldo novo do projeto).
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

    const result = await projectManagementModule.approveActivityCompletion({
      projectId,
      activityId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
      now: new Date(),
    })
    return NextResponse.json(
      { activity: result.activity, award: result.award, shares: result.shares, projectsPoints: result.projectsPoints },
      { status: 200 },
    )
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
