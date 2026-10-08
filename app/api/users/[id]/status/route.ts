import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
// B6-4 (D4): o gate MANAGE_USERS mora em UpdateUserStatusUseCase. O assert roda ANTES da
// validacao do id/acao porque a ordem medida e 403 primeiro; o use case recheca.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    userManagementModule.assertCanManageUsers({ actor })

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const body = await request.json()
    const action = body?.action

    if (!["approve", "reject", "suspend", "activate"].includes(action)) {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
    }

    const user = await userManagementModule.updateUserStatus({
      actor,
      userId: id,
      action,
    })

    return NextResponse.json({ user })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao atualizar status do usuário", exposeMessage: true })
  }
}
