import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
// B6-3 (D4): o gate MANAGE_USERS desceu para ListUserStatisticsUseCase (mensagem default
// "Acesso negado", a do ensurePermission legado). A leitura e so sessao + permissao; nao ha
// validacao de rota antes do gate, entao o use case decide na primeira linha.
const { userManagement: userManagementModule } = getBackendComposition()
export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)

    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type")
    const statistics = await userManagementModule.listUserStatistics(actor, type)

    return NextResponse.json({ statistics })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar estatísticas dos usuários" })
  }
}
