import { NextRequest, NextResponse } from "next/server"
import { ImageProcessor } from "@/lib/utils/image-processor"
import { requireApiActor } from "@/lib/auth/api-guard"
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

    const currentUser = await userManagementModule.findUserById(userId)

    if ((currentUser as any)?.avatar) {
      await ImageProcessor.deleteImage((currentUser as any).avatar)
    }

    const avatarUrl = await ImageProcessor.processAndSave(file, userId, {
      width: 300,
      height: 300,
      quality: 85,
      format: "webp",
    })

    await userManagementModule.updateUserProfile(userId, { avatar: avatarUrl })

    return NextResponse.json({
      success: true,
      avatarUrl,
      message: "Avatar atualizado com sucesso",
    })
  } catch (error) {
    console.error("Erro ao fazer upload do avatar:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
