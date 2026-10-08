import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { notifications: notificationsModule } = getBackendComposition()
export async function POST() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const updatedCount = await notificationsModule.markAllAsRead(auth.actor.id)
    return NextResponse.json(
      {
        success: true,
        message: "Todas as notificações foram marcadas como lidas",
        updatedCount,
      },
      { status: 200 },
    )
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao marcar todas as notificações como lidas" })
  }
}
