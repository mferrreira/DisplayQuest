import { NextResponse } from "next/server"
import { civilDayOfInstant } from "@/backend/domain"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-5 (DEC-126/127/151) — a leitura do cronograma: `GET /api/projects/[id]/cronograma`.
 *
 * Devolve a grade inteira numa chamada só — colunas de mês, metas e atividades com o período e a
 * recompensa derivados — porque a aba é uma tabela: montar a grade a partir de três chamadas
 * deixaria a tela montando a regra, que é o que o domínio já faz (DEC-90).
 *
 * Não há gate de leitura: projeto e as partes dele são do autenticado (DEC-136). O que a rota
 * faz é autenticar, validar o id, entregar o `today` (o domínio nunca lê o relógio sozinho) e
 * mapear erro.
 */

function invalidProject() {
  return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const projectId = Number((await context.params).id)
    if (!Number.isInteger(projectId) || projectId <= 0) return invalidProject()

    const cronograma = await projectManagementModule.listProjectCronograma({
      projectId,
      today: civilDayOfInstant(new Date()),
    })
    return NextResponse.json({ cronograma }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
