import { NextRequest, NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { DomainError } from "@/backend/domain"

const { reporting: reportingModule } = getBackendComposition()

/**
 * V5-9c (DEC-139/152/168) — `POST /api/projects/[id]/technical-reports/[segment]/draft`.
 *
 * Rascunho de IA a partir das três fontes do plano (sessões, tarefas, cronograma). O
 * gate "gestão/líder" mora no use case (404 → 403 → 400, a mesma ordem da geração); o
 * rascunho NÃO exige texto salvo — é o ponto de partida do editor. O padrão de serviço
 * não é DomainError: falha de conexão/HTTP da IA vira **502** com a frase do adaptador
 * de ambiente, não 500 legado. O texto volta para o editor; salvar é decisão humana
 * (o PUT existente), e nenhum byte de IA toca o banco aqui.
 */

function invalidId(value: string | null) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string; segment: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id, segment } = await context.params
    const projectId = invalidId(id)
    if (projectId === null) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const { draft } = await reportingModule.draftTechnicalReport({
      projectId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
      type: segment,
      now: new Date(),
    })

    return NextResponse.json({ draft }, { status: 200 })
  } catch (error: unknown) {
    if (error instanceof DomainError) {
      return routeErrorResponse(error, { fallback: "Erro ao gerar rascunho" })
    }
    // O adaptador OpenAI lança Error comum ("IA indisponível ..."): é padrão de
    // serviço fora, não recusa de pessoa — 502 com a frase que o adaptador mede.
    const message = error instanceof Error && error.message.startsWith("IA indisponível")
      ? error.message
      : "Servidor de IA indisponível — verifique AI_BASE_URL"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
