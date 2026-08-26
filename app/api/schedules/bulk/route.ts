import { NextResponse } from "next/server"
import { requireApiActor, ensurePermission } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { labOperations: labOperationsModule } = getBackendComposition()

interface BulkSlot {
  dayOfWeek: number
  startTime: string
  endTime: string
}

const TIME_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/

function toHttpStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  if (message.includes("Acesso negado")) return 403
  if (message.includes("inválid") || message.includes("Dados inválidos")) return 400
  return 500
}

export async function PUT(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const denied = ensurePermission(auth.actor, "MANAGE_USERS")
    if (denied) return denied

    const raw = await request.text()
    let data: any
    try {
      data = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const targetUserId = Number(data?.userId)
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 })
    }

    if (!Array.isArray(data?.slots)) {
      return NextResponse.json({ error: "Dados inválidos: slots deve ser um array" }, { status: 400 })
    }

    const slots: BulkSlot[] = data.slots.map((slot: any) => ({
      dayOfWeek: Number(slot?.dayOfWeek),
      startTime: String(slot?.startTime ?? ""),
      endTime: String(slot?.endTime ?? ""),
    }))

    for (const slot of slots) {
      const invalidDay = !Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 0 || slot.dayOfWeek > 6
      const invalidTimes =
        !TIME_REGEX.test(slot.startTime) ||
        !TIME_REGEX.test(slot.endTime) ||
        slot.startTime >= slot.endTime
      if (invalidDay || invalidTimes) {
        return NextResponse.json(
          { error: "Dados inválidos: dia da semana ou horários inválidos" },
          { status: 400 },
        )
      }
    }

    const schedules = await labOperationsModule.replaceUserSchedules({
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
      targetUserId,
      slots,
    })

    return NextResponse.json({
      schedules: schedules.map((schedule: any) => schedule.toJSON()),
    })
  } catch (error: unknown) {
    console.error("Erro ao salvar horários em lote:", error)
    const message = error instanceof Error ? error.message : "Erro ao salvar horários"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}
