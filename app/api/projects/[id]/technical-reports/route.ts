import { NextRequest, NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { reporting: reportingModule } = getBackendComposition()

/**
 * V5-9 (DEC-70/139/167) — `GET` e `PUT /api/projects/[id]/technical-reports`.
 *
 * O relatório técnico é por projeto × tipo (DEC-70): um registro editável por par.
 * A leitura é a do autenticado (filho de projeto herda a leitura aberta — regra 13 do
 * plano); a escrita é "gestão/líder" (DEC-139) e o gate mora no use case, com a ordem
 * medida 404 projeto → 403 gate → 400 corpo. A rota autentica, monta o ator e mapeia com
 * `routeErrorResponse` — fino como as rotas do D4.
 */

function invalidId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id } = await context.params
    const projectId = invalidId(id)
    if (projectId === null) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const { reports } = await reportingModule.listTechnicalReports({ projectId })
    return NextResponse.json({ reports }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar relatórios técnicos" })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id } = await context.params
    const projectId = invalidId(id)
    if (projectId === null) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const body = await request.json()
    const { report } = await reportingModule.upsertTechnicalReportContent({
      projectId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
      type: body?.type,
      content: body?.content,
    })
    return NextResponse.json({ report }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao salvar relatório técnico" })
  }
}
