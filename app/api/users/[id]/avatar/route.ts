import { NextRequest, NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { ImageProcessor } from "@/lib/utils/image-processor"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const userId = Number(params.id)
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    if (userId !== auth.actor.id) {
      return NextResponse.json({ error: "Usuário não autorizado" }, { status: 403 })
    }

    // B6-4 (D4): idem users/avatar — trava self-only na rota, ator entregue ao use case.
    const actor = userActor(auth.actor.id, auth.actor.roles)
    const currentUser = await userManagementModule.findUserById(actor, userId)

    if ((currentUser as any)?.avatar) {
      await ImageProcessor.deleteImage((currentUser as any).avatar)
    }

    await userManagementModule.updateUserProfile(actor, userId, { avatar: null })

    return NextResponse.json({
      success: true,
      message: "Avatar removido com sucesso",
    })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
