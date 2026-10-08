import { NextRequest, NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { notifications: notificationsModule } = getBackendComposition()
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const notificationId = Number(params.id)
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return NextResponse.json({ error: "ID de notificação inválido" }, { status: 400 })
    }

    const body = await request.json()
    if (body.action !== "markAsRead") {
      return NextResponse.json({ error: "Ação não suportada" }, { status: 400 })
    }

    const updated = await notificationsModule.markAsRead(auth.actor.id, notificationId)
    if (!updated) {
      return NextResponse.json({ error: "Notificação não encontrada" }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: "Notificação marcada como lida" }, { status: 200 })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao atualizar notificação" })
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const notificationId = Number(params.id)
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return NextResponse.json({ error: "ID de notificação inválido" }, { status: 400 })
    }

    const removed = await notificationsModule.deleteUserNotification(auth.actor.id, notificationId)
    if (!removed) {
      return NextResponse.json({ error: "Notificação não encontrada" }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: "Notificação excluída" }, { status: 200 })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao excluir notificação" })
  }
}
