import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { createLabOperationsModule } from "@/backend/modules/lab-operations"

const labOperationsModule = createLabOperationsModule()

function toHttpStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  if (message.includes("Horário não encontrado")) return 404
  if (message.includes("Acesso negado")) return 403
  if (message.includes("inválid") || message.includes("Dados inválidos")) return 400
  return 500
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Horário inválido" }, { status: 400 })
    }

    const schedule = await labOperationsModule.getUserSchedule(id)
    if (!schedule) {
      return NextResponse.json({ error: "Horário não encontrado" }, { status: 404 })
    }

    const visible = await labOperationsModule.listUserSchedules({
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
      targetUserId: (schedule as any).userId,
    })

    const canAccess = visible.some((entry: any) => entry.id === id)
    if (!canAccess) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    return NextResponse.json({ schedule: (schedule as any).toJSON() })
  } catch (error: unknown) {
    console.error("Erro ao buscar horário:", error)
    const message = error instanceof Error ? error.message : "Erro ao buscar horário"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Horário inválido" }, { status: 400 })
    }

    const body = await request.json()
    const schedule = await labOperationsModule.updateUserSchedule({
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
      scheduleId: id,
      dayOfWeek: body?.dayOfWeek !== undefined ? Number(body.dayOfWeek) : undefined,
      startTime: body?.startTime,
      endTime: body?.endTime,
    })

    return NextResponse.json({ schedule: (schedule as any).toJSON() })
  } catch (error: unknown) {
    console.error("Erro ao atualizar horário:", error)
    const message = error instanceof Error ? error.message : "Erro ao atualizar horário"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Horário inválido" }, { status: 400 })
    }

    await labOperationsModule.deleteUserSchedule({
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
      scheduleId: id,
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Erro ao excluir horário:", error)
    const message = error instanceof Error ? error.message : "Erro ao excluir horário"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}
