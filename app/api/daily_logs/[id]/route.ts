import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"

// B6-5 (D4): o gate (LABORATORISTA, senao self || MANAGE_USERS) desceu para o
// GetDailyLogByIdUseCase mantendo a ordem medida — lookup primeiro (ausente devolve null e a
// rota monta o 404 legado "Log não encontrado"), decisao depois (403 "Acesso negado" agora
// mapeado: {error, code, details}, superset DEC-53).
const { workExecution: workExecutionModule } = getBackendComposition()
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const params = await context.params
    const log = await workExecutionModule.getDailyLogById(actor, Number(params.id))
    if (!log) return NextResponse.json({ error: "Log não encontrado" }, { status: 404 })

    return NextResponse.json({ log })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar log diário:", error)
    return NextResponse.json({ error: "Erro ao buscar log diário" }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  void request
  void context
  return NextResponse.json(
    {
      error: "Edição de daily log foi descontinuada. Ajuste a Work Session associada.",
      deprecated: true,
      replacement: "PATCH /api/work-sessions/:id",
    },
    { status: 410 },
  )
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  void request
  void context
  return NextResponse.json(
    {
      error: "Remoção de daily log foi descontinuada. Ajuste a Work Session associada.",
      deprecated: true,
      replacement: "PATCH /api/work-sessions/:id",
    },
    { status: 410 },
  )
}
