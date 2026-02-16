import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { createUserManagementModule } from "@/backend/modules/user-management"

const userManagementModule = createUserManagementModule()

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") === "tasks" ? "tasks" : "points"
    const limit = searchParams.get("limit")
    const parsedLimit = limit ? Number(limit) : undefined

    const users = await userManagementModule.listLeaderboard({
      type,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    })

    return NextResponse.json({ users, type })
  } catch (error) {
    console.error("Erro ao buscar leaderboard:", error)
    return NextResponse.json({ error: "Erro ao buscar leaderboard" }, { status: 500 })
  }
}
