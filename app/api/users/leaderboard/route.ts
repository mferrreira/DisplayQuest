import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar leaderboard:", error)
    return NextResponse.json({ error: "Erro ao buscar leaderboard" }, { status: 500 })
  }
}
