import { NextRequest, NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { ImageProcessor } from "@/lib/utils/image-processor"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const formData = await request.formData()
    const file = formData.get("avatar") as File
    const userIdRaw = formData.get("userId") as string
    const userId = Number(userIdRaw)

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 })
    }

    if (!Number.isInteger(userId) || userId !== auth.actor.id) {
      return NextResponse.json({ error: "Usuário não autorizado" }, { status: 403 })
    }

    const validation = ImageProcessor.validateImage(file)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // B6-4 (D4): a trava self-only desta rota (fora do D4) fica onde esta; o use case agora
    // exige o ator e o gate self-or-manage passa porque quem chega aqui e sempre o proprio.
    const actor = userActor(auth.actor.id, auth.actor.roles)
    const currentUser = await userManagementModule.findUserById(actor, userId)

    if ((currentUser as any)?.avatar) {
      await ImageProcessor.deleteImage((currentUser as any).avatar)
    }

    const avatarUrl = await ImageProcessor.processAndSave(file, userId, {
      width: 300,
      height: 300,
      quality: 85,
      format: "webp",
    })

    await userManagementModule.updateUserProfile(actor, userId, { avatar: avatarUrl })

    return NextResponse.json({
      success: true,
      avatarUrl,
      message: "Avatar atualizado com sucesso",
    })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
