import { NextRequest, NextResponse } from "next/server"
import { ImageProcessor } from "@/lib/utils/image-processor"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const userId = Number(params.id)
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    if (userId !== auth.actor.id) {
      return NextResponse.json({ error: "Usuário não autorizado" }, { status: 403 })
    }

    const currentUser = await userManagementModule.findUserById(userId)

    if ((currentUser as any)?.avatar) {
      await ImageProcessor.deleteImage((currentUser as any).avatar)
    }

    await userManagementModule.updateUserProfile(userId, { avatar: null })

    return NextResponse.json({
      success: true,
      message: "Avatar removido com sucesso",
    })
  } catch (error) {
    console.error("Erro ao remover avatar:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
