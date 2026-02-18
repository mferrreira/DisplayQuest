import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { createUserManagementModule } from "@/backend/modules/user-management"

const userManagementModule = createUserManagementModule()

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const deny = ensurePermission(auth.actor, "MANAGE_USERS")
    if (deny) return deny

    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type")
    const statistics = await userManagementModule.listUserStatistics(type)

    return NextResponse.json({ statistics })
  } catch (error: unknown) {
    console.error("Erro ao buscar estatísticas dos usuários:", error)
    const message = error instanceof Error ? error.message : "Erro ao buscar estatísticas dos usuários"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
