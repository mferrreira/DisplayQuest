import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { PASSWORD_RESET_NEUTRAL_MESSAGE, userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"

const { userManagement: userManagementModule } = getBackendComposition()

/**
 * plan-v24 S01 — a superfície pública da solicitação de troca de senha.
 *
 * POST é público (sem sessão): é o primeiro endpoint do sistema que cria dado sem ator, e
 * a resposta é a MESMA para email existente e inexistente (ADR-002, INV2 — a mensagem
 * congelada no domínio). Validação, duplo pending e hash vivem no use case; a rota só
 * transporta e mapeia (`domainErrorResponse`: Validation 400, Conflict 409).
 *
 * GET é da gestão: o gate `MANAGE_USERS` com "Acesso negado." mora no
 * ListPasswordResetRequestsUseCase, como no fluxo de moderação de contas (CA6).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    await userManagementModule.requestPasswordReset({
      email: body?.email ?? null,
      password: body?.password ?? null,
    })

    // A resposta não distingue os casos: `null` (email inexistente) e linha criada
    // produzem exatamente o mesmo 201. A hash nunca sai pela rota (INV1, CA6).
    return NextResponse.json({ message: PASSWORD_RESET_NEUTRAL_MESSAGE }, { status: 201 })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}

export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const requests = (await userManagementModule.listPasswordResetRequests(
      userActor(auth.actor.id, auth.actor.roles),
    )) as Array<Record<string, unknown>>

    return NextResponse.json({ requests }, { status: 200 })
  } catch (error) {
    return routeErrorResponse(error, {
      fallback: "Erro ao buscar solicitações de troca de senha",
    })
  }
}
