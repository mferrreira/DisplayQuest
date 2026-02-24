import { NextRequest, NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { notifications: notificationsModule } = getBackendComposition()
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get("unread") === "true"
    const countOnly = searchParams.get("count") === "true"

    if (countOnly) {
      const count = await notificationsModule.getUnreadCount(auth.actor.id)
      return NextResponse.json({ success: true, count }, { status: 200 })
    }

    const notifications = await notificationsModule.listUserNotifications(auth.actor.id, unreadOnly)
    return NextResponse.json({ success: true, notifications }, { status: 200 })
  } catch (error) {
    console.error("Erro ao buscar notificações:", error)
    return NextResponse.json({ error: "Erro ao buscar notificações" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const permissionError = ensurePermission(
      auth.actor,
      "MANAGE_NOTIFICATIONS",
      "Sem permissão para criar notificações",
    )
    if (permissionError) return permissionError

    const body = await request.json()
    const title = typeof body.title === "string" ? body.title.trim() : ""
    const message = typeof body.message === "string" ? body.message.trim() : ""
    const type = typeof body.type === "string" && body.type.trim().length > 0
      ? body.type.trim()
      : "SYSTEM_ANNOUNCEMENT"

    if (!title || !message) {
      return NextResponse.json({ error: "Título e mensagem são obrigatórios" }, { status: 400 })
    }

    const sendToAll = body.sendToAll === true
    const userIds = Array.isArray(body.userIds)
      ? body.userIds.map((value: unknown) => Number(value)).filter((id: number) => Number.isInteger(id) && id > 0)
      : typeof body.userId === "number" && Number.isInteger(body.userId) && body.userId > 0
        ? [body.userId]
        : []

    const audience = sendToAll
      ? { mode: "ALL_ACTIVE_USERS" as const }
      : { mode: "USER_IDS" as const, userIds }

    if (!sendToAll && userIds.length === 0) {
      return NextResponse.json({ error: "Informe ao menos um destinatário" }, { status: 400 })
    }

    const result = await notificationsModule.publishEvent({
      eventType: type,
      title,
      message,
      data: body.data,
      triggeredByUserId: auth.actor.id,
      audience,
    })

    return NextResponse.json(
      {
        success: true,
        message: "Notificação enviada com sucesso",
        createdCount: result.createdCount,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("Erro ao criar notificação:", error)
    const message = error instanceof Error ? error.message : "Erro ao criar notificação"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
