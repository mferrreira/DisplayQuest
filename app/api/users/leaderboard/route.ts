import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
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
    return routeErrorResponse(error, { fallback: "Erro ao buscar leaderboard" })
  }
}
