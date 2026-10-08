import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"

// B6-5 (D4): a composta `MANAGE_USERS || LABORATORISTA` (medida — mesma classe da DEC-117),
// o caminho do lider e o self forcado desceram para o ListDailyLogsUseCase, lendo o ActorRef.
// A rota mantem so as validacoes de entrada (400 "userId inválido"/"projectId inválido"), que
// na ordem medida vem ANTES de qualquer 403. Evolucoes medidas:
//  - o 403 do caminho do lider passou de corpo plain "Acesso negado." (com PONTO — congelado)
//    para {error, code, details} (superset, DEC-53);
//  - o `catch {}` do caminho do userId engolia TUDO como 403; removido, erro de infraestrutura
//    agora e 500 de verdade (o engolimento escondia falha — mesma honestidade do B6-2b).
// POST segue 410 descontinuado, sem ator (nenhuma decisao de autoridade ali).
const { workExecution: workExecutionModule } = getBackendComposition()

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const date = searchParams.get("date")
    const projectId = searchParams.get("projectId")

    if (userId !== null && (!/^\d+$/.test(userId) || Number(userId) <= 0)) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 })
    }
    if (projectId !== null && (!/^\d+$/.test(projectId) || Number(projectId) <= 0)) {
      return NextResponse.json({ error: "projectId inválido" }, { status: 400 })
    }

    const logs = await workExecutionModule.listDailyLogs({
      actor,
      userId: userId !== null ? Number(userId) : undefined,
      projectId: projectId !== null ? Number(projectId) : undefined,
      date: date || undefined,
    })

    return NextResponse.json({ logs })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar logs diários:", error)
    return NextResponse.json({ error: "Erro ao buscar logs diários" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  void request
  return NextResponse.json(
    {
      error: "Criação manual de daily log foi descontinuada. Finalize a work session para registrar o log.",
      deprecated: true,
      replacement: "PATCH /api/work-sessions/:id com status=completed e dailyLogNote",
    },
    { status: 410 },
  )
}
