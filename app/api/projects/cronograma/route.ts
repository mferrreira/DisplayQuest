import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * plan-v13 (S04, regra 7) — `GET /api/projects/cronograma`: as atividades de cronograma de
 * TODOS os projetos numa chamada só, para a tela de gráficos do Dashboard.
 *
 * Não há gate de leitura: projeto e as partes dele são do autenticado (DEC-136). A rota
 * autentica, devolve os campos que a tela consome (id, projectId, order, status, firstMonth,
 * lastMonth) e mapeia erro. O recorte e a janela são da tela, não do servidor — quem decide
 * calendário é `backend/domain`, e a tela só monta a grade.
 *
 * O slug estático `cronograma` ganha do dinâmico `[id]` no roteamento do Next, e a rota é
 * plural: `/api/projects/cronograma` não colide com `/api/projects/[id]`.
 */
export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const activities = await projectManagementModule.listAllProjectActivities(actor)

    return NextResponse.json({ activities }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar as atividades dos projetos" })
  }
}
