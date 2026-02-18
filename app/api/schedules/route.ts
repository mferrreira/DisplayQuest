import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { createLabOperationsModule } from "@/backend/modules/lab-operations"

const labOperationsModule = createLabOperationsModule()

function toHttpStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  if (message.includes("Acesso negado")) return 403
  if (message.includes("inválid") || message.includes("Dados inválidos")) return 400
  return 500
}

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const userIdParam = searchParams.get("userId")
    const targetUserId = userIdParam ? Number(userIdParam) : undefined

    if (userIdParam && (!Number.isInteger(targetUserId) || targetUserId! <= 0)) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 })
    }

    const schedules = await labOperationsModule.listUserSchedules({
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
      targetUserId,
    })

    return NextResponse.json({
      schedules: schedules.map((schedule: any) => schedule.toJSON()),
    })
  } catch (error: unknown) {
    console.error("Erro ao buscar horários:", error)
    const message = error instanceof Error ? error.message : "Erro ao buscar horários"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const data = await request.json()
    const targetUserId = data?.userId ? Number(data.userId) : auth.actor.id

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 })
    }

    const schedule = await labOperationsModule.createUserSchedule({
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
      targetUserId,
      dayOfWeek: Number(data?.dayOfWeek),
      startTime: data?.startTime,
      endTime: data?.endTime,
    })

    return NextResponse.json({
      schedule: (schedule as any).toJSON(),
    }, { status: 201 })
  } catch (error: unknown) {
    console.error("Erro ao criar horário:", error)
    const message = error instanceof Error ? error.message : "Erro ao criar horário"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}
